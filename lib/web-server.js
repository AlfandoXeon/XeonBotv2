import http from 'node:http'
import crypto from 'node:crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json')
const PERSONA_PATH = path.join(ROOT_DIR, 'persona.txt')
const DASHBOARD_HTML_PATH = path.join(__dirname, 'dashboard.html')

const MAX_CHAT_LOGS = 80
const MAX_SYS_LOGS = 150
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const LOGIN_WINDOW_MS = 60 * 1000
const MAX_LOGIN_ATTEMPTS = 5

const stripAnsi = (str = '') => String(str).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')

export function createWebServer({
   ipcRequest,
   restartWorker,
   resetSessionAndRestart,
   cleanTemp,
   getTempSize,
   isWorkerRunning
}) {
   const sessions = new Map()
   const loginAttempts = new Map()
   const chatLogs = []
   const systemLogs = []
   const sseClients = new Set()
   let latestPairingCode = ''

   const getPassword = () => {
      const envPass = (process.env.WEB_PASSWORD || '').trim()
      return envPass || 'admin'
   }

   const verifyPassword = (input) => {
      const expected = Buffer.from(getPassword(), 'utf-8')
      const actual = Buffer.from(String(input || ''), 'utf-8')
      if (expected.length !== actual.length) return false
      return crypto.timingSafeEqual(expected, actual)
   }

   const parseCookies = (cookieHeader = '') => {
      const out = {}
      cookieHeader.split(';').forEach(part => {
         const idx = part.indexOf('=')
         if (idx > -1) {
            const k = part.slice(0, idx).trim()
            const v = part.slice(idx + 1).trim()
            out[k] = decodeURIComponent(v)
         }
      })
      return out
   }

   const isAuthenticated = (req) => {
      const cookies = parseCookies(req.headers.cookie)
      const token = cookies.xeon_session || req.headers['x-auth-token']
      if (!token || !sessions.has(token)) return false
      const expiresAt = sessions.get(token)
      if (Date.now() > expiresAt) {
         sessions.delete(token)
         return false
      }
      return true
   }

   const broadcastSse = (event, payload) => {
      const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
      for (const clientRes of sseClients) {
         try {
            clientRes.write(frame)
         } catch {
            sseClients.delete(clientRes)
         }
      }
   }

   const pushChatLog = (entry) => {
      const item = {
         id: crypto.randomUUID(),
         timestamp: Date.now(),
         ...entry
      }
      chatLogs.unshift(item)
      if (chatLogs.length > MAX_CHAT_LOGS) {
         chatLogs.length = MAX_CHAT_LOGS
      }
      broadcastSse('chat_log', item)
   }

   const pushSystemLog = (rawText, level = 'INFO') => {
      const cleaned = stripAnsi(rawText)
      const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      const time = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })

      for (const line of lines) {
         const pairMatch = line.match(/Pairing Code\s*:\s*([A-Z0-9-]+)/i)
         if (pairMatch) {
            latestPairingCode = pairMatch[1].trim()
            broadcastSse('pairing_code', { code: latestPairingCode, time })
         }

         const item = {
            id: crypto.randomUUID(),
            time,
            level,
            text: line
         }
         systemLogs.unshift(item)
         if (systemLogs.length > MAX_SYS_LOGS) {
            systemLogs.length = MAX_SYS_LOGS
         }
         broadcastSse('sys_log', item)
      }
   }

   const readJsonBody = (req) => new Promise((resolve, reject) => {
      let body = ''
      req.on('data', chunk => {
         body += chunk
         if (body.length > 1024 * 1024) {
            reject(new Error('Payload too large'))
            req.destroy()
         }
      })
      req.on('end', () => {
         if (!body) return resolve({})
         try {
            resolve(JSON.parse(body))
         } catch {
            reject(new Error('Invalid JSON payload'))
         }
      })
      req.on('error', reject)
   })

   const sendJson = (res, statusCode, data, extraHeaders = {}) => {
      const payload = JSON.stringify(data)
      res.writeHead(statusCode, {
         'Content-Type': 'application/json; charset=utf-8',
         'Cache-Control': 'no-store',
         ...extraHeaders
      })
      res.end(payload)
   }

   const readConfigFile = async () => {
      try {
         const raw = await fsPromises.readFile(CONFIG_PATH, 'utf-8')
         return JSON.parse(raw)
      } catch {
         return {}
      }
   }

   const writeConfigFile = async (newConfig) => {
      const current = await readConfigFile()
      const merged = {
         ...current,
         ...newConfig,
         pairing: {
            ...(current.pairing || {}),
            ...(newConfig.pairing || {})
         }
      }
      await fsPromises.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 3), 'utf-8')
      return merged
   }

   const readPersonaFile = async () => {
      try {
         return await fsPromises.readFile(PERSONA_PATH, 'utf-8')
      } catch {
         return ''
      }
   }

   const writePersonaFile = async (content) => {
      await fsPromises.writeFile(PERSONA_PATH, String(content ?? ''), 'utf-8')
   }

   const server = http.createServer(async (req, res) => {
      try {
         const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
         const pathname = urlObj.pathname

         // 1. Public Health Check for Render
         if (pathname === '/health' || pathname === '/ping') {
            return sendJson(res, 200, {
               ok: true,
               service: 'XeonBot Web Panel',
               workerRunning: isWorkerRunning(),
               uptime: Math.floor(process.uptime())
            })
         }

         // 2. Serve Single-Page Dashboard UI
         if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
            try {
               const html = await fsPromises.readFile(DASHBOARD_HTML_PATH, 'utf-8')
               res.writeHead(200, {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'no-cache'
               })
               return res.end(html)
            } catch (e) {
               res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
               return res.end('Dashboard UI file missing: ' + e.message)
            }
         }

         // 3. Auth Endpoints
         if (pathname === '/api/auth/check' && req.method === 'GET') {
            return sendJson(res, 200, { authenticated: isAuthenticated(req) })
         }

         if (pathname === '/api/login' && req.method === 'POST') {
            const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
            const now = Date.now()
            const record = loginAttempts.get(ip)
            if (record && now < record.resetAt && record.count >= MAX_LOGIN_ATTEMPTS) {
               const waitSec = Math.ceil((record.resetAt - now) / 1000)
               return sendJson(res, 429, { status: false, msg: `Terlalu banyak percobaan gagal. Coba lagi dalam ${waitSec} detik.` })
            }

            const body = await readJsonBody(req)
            if (!verifyPassword(body.password)) {
               const prev = (record && now < record.resetAt) ? record.count : 0
               loginAttempts.set(ip, { count: prev + 1, resetAt: now + LOGIN_WINDOW_MS })
               return sendJson(res, 401, { status: false, msg: 'Password tidak sesuai.' })
            }

            loginAttempts.delete(ip)
            const token = crypto.randomBytes(32).toString('hex')
            sessions.set(token, now + SESSION_TTL_MS)

            const cookie = `xeon_session=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Strict`
            return sendJson(res, 200, { status: true, msg: 'Autentikasi berhasil' }, { 'Set-Cookie': cookie })
         }

         if (pathname === '/api/logout' && req.method === 'POST') {
            const cookies = parseCookies(req.headers.cookie)
            if (cookies.xeon_session) sessions.delete(cookies.xeon_session)
            return sendJson(
               res,
               200,
               { status: true },
               { 'Set-Cookie': 'xeon_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict' }
            )
         }

         // 4. Protected Routes
         if (pathname.startsWith('/api/')) {
            if (!isAuthenticated(req)) {
               return sendJson(res, 401, { status: false, msg: 'Unauthorized' })
            }

            // GET /api/stream -> Realtime Server-Sent Events (SSE)
            if (pathname === '/api/stream' && req.method === 'GET') {
               res.writeHead(200, {
                  'Content-Type': 'text/event-stream',
                  'Cache-Control': 'no-cache',
                  'Connection': 'keep-alive'
               })
               res.write(`event: connected\ndata: {"ok":true}\n\n`)
               sseClients.add(res)
               req.on('close', () => sseClients.delete(res))
               return
            }

            // GET /api/overview
            if (pathname === '/api/overview' && req.method === 'GET') {
               const [config, persona, tempSize, workerData] = await Promise.all([
                  readConfigFile(),
                  readPersonaFile(),
                  getTempSize(),
                  ipcRequest('get_overview', {}, 3500).catch(() => null)
               ])

               if (workerData?.connected) {
                  latestPairingCode = ''
               }

               return sendJson(res, 200, {
                  status: true,
                  masterUptime: Math.floor(process.uptime()),
                  masterRam: process.memoryUsage().rss,
                  workerRunning: isWorkerRunning(),
                  pairingCode: latestPairingCode,
                  tempSize,
                  worker: workerData || {
                     connected: false,
                     botUser: null,
                     workerUptime: 0,
                     workerRam: 0,
                     dbName: 'Local',
                     stats: { users: 0, chats: 0, groups: 0, premium: 0, banned: 0, hitstat: 0 },
                     setting: {},
                     plugins: []
                  },
                  config,
                  persona,
                  chatLogs,
                  systemLogs
               })
            }

            // POST /api/config
            if (pathname === '/api/config' && req.method === 'POST') {
               const body = await readJsonBody(req)
               const current = await readConfigFile()

               const updated = await writeConfigFile({
                  owner: String(body.owner ?? current.owner ?? '').replace(/[^0-9]/g, ''),
                  owner_name: String(body.owner_name ?? current.owner_name ?? ''),
                  limit: Number(body.limit ?? current.limit ?? 100),
                  ram_limit: String(body.ram_limit ?? current.ram_limit ?? '900mb'),
                  cooldown: Number(body.cooldown ?? current.cooldown ?? 3),
                  groq_api_key: String(body.groq_api_key ?? current.groq_api_key ?? ''),
                  menuaudio: body.menuaudio !== undefined ? Boolean(body.menuaudio) : Boolean(current.menuaudio ?? true),
                  menu_audio: String(body.menu_audio ?? current.menu_audio ?? './media/audio/menuSong.mp3'),
                  menu_audio_ptt: body.menu_audio_ptt !== undefined ? Boolean(body.menu_audio_ptt) : Boolean(current.menu_audio_ptt ?? false),
                  pairing: {
                     ...(current.pairing || {}),
                     state: body.pairing_state !== undefined ? Boolean(body.pairing_state) : (current.pairing?.state ?? true),
                     number: body.pairing_number ? Number(String(body.pairing_number).replace(/[^0-9]/g, '')) : (current.pairing?.number ?? 0),
                     code: body.pairing_code !== undefined ? String(body.pairing_code) : (current.pairing?.code ?? 'XEONBOT1')
                  }
               })

               await ipcRequest('sync_config', { config: updated }, 3000).catch(() => null)
               return sendJson(res, 200, { status: true, msg: 'Konfigurasi berhasil disimpan', config: updated })
            }

            // POST /api/persona
            if (pathname === '/api/persona' && req.method === 'POST') {
               const body = await readJsonBody(req)
               if (typeof body.persona !== 'string') {
                  return sendJson(res, 400, { status: false, msg: 'Data persona tidak valid' })
               }
               await writePersonaFile(body.persona)
               await ipcRequest('sync_persona', { persona: body.persona }, 3000).catch(() => null)
               return sendJson(res, 200, { status: true, msg: 'Persona AI berhasil disimpan' })
            }

            // POST /api/settings
            if (pathname === '/api/settings' && req.method === 'POST') {
               const body = await readJsonBody(req)
               if (body.menuaudio !== undefined) {
                  const updatedCfg = await writeConfigFile({ menuaudio: Boolean(body.menuaudio) })
                  await ipcRequest('sync_config', { config: updatedCfg }, 3000).catch(() => null)
               }
               const result = await ipcRequest('update_setting', body, 4000).catch(() => null)
               return sendJson(res, 200, {
                  status: true,
                  msg: 'Pengaturan sistem diperbarui',
                  setting: result?.setting || body
               })
            }

            // GET /api/users
            if (pathname === '/api/users' && req.method === 'GET') {
               const q = urlObj.searchParams.get('q') || ''
               const result = await ipcRequest('get_users', { q }, 4000)
               return sendJson(res, 200, { status: true, users: result?.users || [] })
            }

            // POST /api/users/update
            if (pathname === '/api/users/update' && req.method === 'POST') {
               const body = await readJsonBody(req)
               const result = await ipcRequest('update_user', body, 4000)
               return sendJson(res, 200, { status: true, msg: result?.msg || 'Data user diperbarui', user: result?.user })
            }

            // POST /api/action -> restart (Reconnect), relink (Reset Session & Pair), clean_temp, clear_logs
            if (pathname === '/api/action' && req.method === 'POST') {
               const body = await readJsonBody(req)
               if (body.action === 'restart') {
                  latestPairingCode = ''
                  pushSystemLog('Menjalankan reconnect worker...', 'INFO')
                  restartWorker()
                  return sendJson(res, 200, { status: true, msg: 'Menghubungkan ulang koneksi worker...' })
               }
               if (body.action === 'relink') {
                  latestPairingCode = ''
                  if (body.pairing_number || body.pairing_code) {
                     const current = await readConfigFile()
                     await writeConfigFile({
                        pairing: {
                           ...(current.pairing || {}),
                           state: true,
                           number: body.pairing_number ? Number(String(body.pairing_number).replace(/[^0-9]/g, '')) : current.pairing?.number,
                           code: body.pairing_code ? String(body.pairing_code).trim() : current.pairing?.code
                        }
                     })
                  }
                  pushSystemLog('Meriset sesi lama dan meminta kode pairing baru...', 'INFO')
                  await resetSessionAndRestart()
                  return sendJson(res, 200, { status: true, msg: 'Sesi direset. Menunggu kode pairing baru di log...' })
               }
               if (body.action === 'clean_temp') {
                  await cleanTemp()
                  const newSize = await getTempSize()
                  return sendJson(res, 200, { status: true, msg: 'Folder temp dibersihkan', tempSize: newSize })
               }
               if (body.action === 'clear_logs') {
                  chatLogs.length = 0
                  systemLogs.length = 0
                  return sendJson(res, 200, { status: true, msg: 'Log dibersihkan' })
               }
               return sendJson(res, 400, { status: false, msg: 'Aksi tidak valid' })
            }

            return sendJson(res, 404, { status: false, msg: 'Endpoint tidak ditemukan' })
         }

         res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
         res.end('404 Not Found')
      } catch (e) {
         sendJson(res, 500, { status: false, msg: e.message || 'Internal Server Error' })
      }
   })

   const port = Number(process.env.PORT) || 8080
   server.listen(port, '0.0.0.0', () => {
      console.log(`[Web Panel] Active on http://localhost:${port} (Health: /health)`)
   })

   return {
      server,
      pushChatLog,
      pushSystemLog
   }
}
