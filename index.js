import 'dotenv/config'
import 'rootpath'
import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import CFonts from 'cfonts'
import { fileURLToPath } from 'url'
import { Utils } from '@neoxr/wb'
import http from 'http'

import { createWebServer } from './lib/web-server.js'
import crypto from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEMP_DIR = path.resolve('./temp')

const ensureTempDir = async () => {
   try {
      await fs.mkdir(TEMP_DIR, { recursive: true })
   } catch (e) {
      Utils.printError('Failed to ensure temp directory: ' + e)
   }
}

const cleanTemp = async () => {
   try {
      const files = await fs.readdir(TEMP_DIR)

      await Promise.all(
         files.map(async file => {
            if (file.endsWith('.file')) return

            const filePath = path.join(TEMP_DIR, file)
            try {
               const stats = await fs.stat(filePath)
               if (stats.isFile()) await fs.unlink(filePath)
            } catch {
               Utils.printWarning(`Skip failed file: ${file}`)
            }
         })
      )
   } catch (e) {
      Utils.printError('Error reading temp directory: ' + e)
   }
}

const getTempSize = async () => {
   let total = 0
   try {
      const files = await fs.readdir(TEMP_DIR)
      for (const file of files) {
         if (file.endsWith('.file')) continue
         try {
            const stats = await fs.stat(path.join(TEMP_DIR, file))
            if (stats.isFile()) total += stats.size
         } catch { }
      }
   } catch { }
   return total
}

const startAutoClean = async () => {
   await ensureTempDir()
   cleanTemp()
   setInterval(cleanTemp, 60 * 60 * 1000) // 1 hours
}

let p = null
let webServer = null
const pendingIpc = new Map()

function ipcRequest(action, payload = {}, timeoutMs = 4000) {
   return new Promise((resolve, reject) => {
      if (!p || !p.connected) {
         return reject(new Error('Worker bot sedang tidak aktif'))
      }
      const reqId = crypto.randomUUID()
      const timer = setTimeout(() => {
         pendingIpc.delete(reqId)
         reject(new Error('IPC request timeout'))
      }, timeoutMs)

      pendingIpc.set(reqId, { resolve, reject, timer })
      p.send({ type: 'ipc_req', reqId, action, payload })
   })
}

function restartWorker() {
   if (p) {
      console.log('Restarting worker from Web Panel / IPC...')
      p.kill()
      p = null
   } else {
      start()
   }
}

async function resetSessionAndRestart() {
   const sessionDir = path.resolve('./session')
   try {
      const files = await fs.readdir(sessionDir).catch(() => [])
      await Promise.all(
         files.map(file => fs.rm(path.join(sessionDir, file), { recursive: true, force: true }).catch(() => {}))
      )
   } catch { }
   restartWorker()
}

function start() {
   const args = [path.join(__dirname, 'client.js'), ...process.argv.slice(2)]
   p = spawn(process.argv[0], args, {
      stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, FORCE_COLOR: '1' }
   })

   if (p.stdout) {
      p.stdout.on('data', chunk => {
         process.stdout.write(chunk)
         if (webServer) webServer.pushSystemLog(chunk.toString(), 'INFO')
      })
   }

   if (p.stderr) {
      p.stderr.on('data', chunk => {
         process.stderr.write(chunk)
         if (webServer) webServer.pushSystemLog(chunk.toString(), 'ERR')
      })
   }

   p.on('message', data => {
      if (data === 'reset') {
         restartWorker()
         return
      }
      if (data && typeof data === 'object') {
         if (data.type === 'chat_log' && webServer) {
            webServer.pushChatLog(data.data)
         } else if (data.type === 'ipc_res' && data.reqId && pendingIpc.has(data.reqId)) {
            const pending = pendingIpc.get(data.reqId)
            clearTimeout(pending.timer)
            pendingIpc.delete(data.reqId)
            if (data.ok) pending.resolve(data.data)
            else pending.reject(new Error(data.error || 'IPC Error'))
         }
      }
   })
      .on('exit', code => {
         console.error('Exited with code:', code)
         start()
      })
}

console.clear()
const major = parseInt(process.versions.node.split('.')[0], 10)
if (major < 20) {
   console.error(
      `\n❌ This script requires Node.js 20+ to run reliably.\n` +
      `   You are using Node.js ${process.versions.node}.\n` +
      `   Please upgrade to Node.js 20+ to proceed.\n`
   )
   process.exit(1)
}

CFonts.say('XEON BOT', {
   font: 'tiny',
   align: 'center',
   colors: ['system']
})
CFonts.say('Github : https://github.com/neoxr/neoxr-bot', {
   colors: ['system'],
   font: 'console',
   align: 'center'
})

webServer = createWebServer({
   ipcRequest,
   restartWorker,
   resetSessionAndRestart,
   cleanTemp,
   getTempSize,
   isWorkerRunning: () => Boolean(p && p.connected)
})

start()
startAutoClean()