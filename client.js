import { Client, Config, Utils } from '@neoxr/wb'
import baileys from './lib/engine.js'
// import './lib/proto.js'
import './error.js'
import './lib/config.js'
import './lib/functions.js'
import bytes from 'bytes'
import fs from 'fs'
import fsPromise from 'fs/promises'
import colors from 'colors'
import cron from 'node-cron'
import extra from './lib/listeners-extra.js'
import { models, structure } from './lib/models.js'
import system from './lib/adapter.js'

import path from 'path'

// Pastikan folder temp selalu ada agar sendMessageModify / download media tidak error ENOENT
if (!fs.existsSync('./temp')) {
   fs.mkdirSync('./temp', { recursive: true })
}

let activeClient = null

process.on('message', async msg => {
   if (!msg || typeof msg !== 'object' || msg.type !== 'ipc_req') return
   const { reqId, action, payload } = msg
   const reply = (ok, data = null, error = null) => {
      if (typeof process.send === 'function') {
         process.send({ type: 'ipc_res', reqId, ok, data, error })
      }
   }

   try {
      const db = global.db || {}
      const setting = db.setting || {}

      if (action === 'get_overview') {
         const sock = activeClient?.sock
         const connected = Boolean(sock?.user?.id)
         const hitstat = Object.values(db.statistic || {}).reduce((acc, v) => acc + (v?.hitstat || 0), 0)
         const rawPlugins = activeClient?.plugins || {}
         const plugins = Object.entries(rawPlugins).map(([dir, prop]) => {
            const name = path.basename(dir, '.js')
            return {
               name,
               category: prop?.run?.category || (prop?.run?.usage ? 'command' : 'event'),
               usage: prop?.run?.usage || null,
               disabled: Array.isArray(setting.pluginDisable) && setting.pluginDisable.includes(name)
            }
         }).sort((a, b) => a.name.localeCompare(b.name))

         return reply(true, {
            connected,
            botUser: sock?.user || null,
            workerUptime: Math.floor(process.uptime()),
            workerRam: process.memoryUsage().rss,
            dbName: system.name || 'Local',
            stats: {
               users: (db.users || []).length,
               chats: (db.chats || []).length,
               groups: (db.groups || []).length,
               premium: (db.users || []).filter(v => v.premium).length,
               banned: (db.users || []).filter(v => v.banned).length,
               hitstat
            },
            setting,
            plugins
         })
      }

      if (action === 'update_setting') {
         if (!global.db?.setting) throw new Error('Database belum siap.')
         const allowedBoolean = ['chatbotai', 'menuaudio', 'autodownload', 'antispam', 'self', 'groupmode', 'online', 'multiprefix', 'noprefix', 'autobackup', 'notifier', 'debug']
         for (const key of allowedBoolean) {
            if (payload[key] !== undefined) {
               global.db.setting[key] = Boolean(payload[key])
            }
         }
         if (payload.menuaudio !== undefined) {
            const audioState = Boolean(payload.menuaudio)
            Config.menuaudio = audioState
            try {
               const rawCfg = await fsPromise.readFile('./config.json', 'utf-8').catch(() => '{}')
               const parsedCfg = JSON.parse(rawCfg)
               parsedCfg.menuaudio = audioState
               await fsPromise.writeFile('./config.json', JSON.stringify(parsedCfg, null, 3), 'utf-8')
               if (global.db.setting._webConfigBackup) {
                  global.db.setting._webConfigBackup.menuaudio = audioState
               }
            } catch { }
         }
         if (payload.onlyprefix !== undefined && payload.onlyprefix) global.db.setting.onlyprefix = String(payload.onlyprefix)
         if (Array.isArray(payload.prefix)) global.db.setting.prefix = payload.prefix
         if (payload.style !== undefined) global.db.setting.style = Number(payload.style) || 4
         if (payload.sk_pack !== undefined) global.db.setting.sk_pack = String(payload.sk_pack)
         if (payload.sk_author !== undefined) global.db.setting.sk_author = String(payload.sk_author)
         if (payload.link !== undefined) global.db.setting.link = String(payload.link)
         if (Array.isArray(payload.owners)) global.db.setting.owners = payload.owners
         if (payload.msg !== undefined) global.db.setting.msg = String(payload.msg)

         return reply(true, { setting: global.db.setting })
      }

      if (action === 'sync_config') {
         const cfg = payload?.config || {}
         if (cfg.owner !== undefined) Config.owner = cfg.owner
         if (cfg.owner_name !== undefined) Config.owner_name = cfg.owner_name
         if (cfg.limit !== undefined) Config.limit = cfg.limit
         if (cfg.ram_limit !== undefined) Config.ram_limit = cfg.ram_limit
         if (cfg.cooldown !== undefined) Config.cooldown = cfg.cooldown
         if (cfg.max_upload !== undefined) Config.max_upload = cfg.max_upload
         if (cfg.max_upload_free !== undefined) Config.max_upload_free = cfg.max_upload_free
         if (cfg.groq_api_key !== undefined) Config.groq_api_key = cfg.groq_api_key
         if (cfg.menuaudio !== undefined) {
            Config.menuaudio = Boolean(cfg.menuaudio)
            if (global.db?.setting) global.db.setting.menuaudio = Boolean(cfg.menuaudio)
         }
         if (cfg.menu_audio !== undefined) Config.menu_audio = cfg.menu_audio
         if (cfg.menu_audio_ptt !== undefined) Config.menu_audio_ptt = cfg.menu_audio_ptt
         if (cfg.pairing) Config.pairing = { ...(Config.pairing || {}), ...cfg.pairing }

         if (global.db?.setting) {
            global.db.setting._webConfigBackup = cfg
         }
         return reply(true, { ok: true })
      }

      if (action === 'sync_persona') {
         if (global.db?.setting && typeof payload?.persona === 'string') {
            global.db.setting._webPersonaBackup = payload.persona
         }
         return reply(true, { ok: true })
      }

      if (action === 'toggle_plugin') {
         if (!global.db?.setting) throw new Error('Database belum siap.')
         const { name, disable } = payload
         if (!Array.isArray(global.db.setting.pluginDisable)) global.db.setting.pluginDisable = []
         if (disable) {
            if (!global.db.setting.pluginDisable.includes(name)) {
               global.db.setting.pluginDisable.push(name)
            }
         } else {
            global.db.setting.pluginDisable = global.db.setting.pluginDisable.filter(p => p !== name)
         }
         const rawPlugins = activeClient?.plugins || {}
         const plugins = Object.entries(rawPlugins).map(([dir, prop]) => {
            const pName = path.basename(dir, '.js')
            return {
               name: pName,
               category: prop?.run?.category || (prop?.run?.usage ? 'command' : 'event'),
               disabled: global.db.setting.pluginDisable.includes(pName)
            }
         }).sort((a, b) => a.name.localeCompare(b.name))

         return reply(true, {
            msg: `Plugin ${name}.js berhasil di-${disable ? 'nonaktifkan' : 'aktifkan'}`,
            plugins
         })
      }

      if (action === 'get_users') {
         const q = (payload?.q || '').toLowerCase()
         const list = (global.db?.users || [])
            .filter(u => !q || (u.name || '').toLowerCase().includes(q) || (u.jid || '').toLowerCase().includes(q))
            .sort((a, b) => (b.lastseen || 0) - (a.lastseen || 0))
            .slice(0, 100)
         return reply(true, { users: list })
      }

      if (action === 'update_user') {
         const user = (global.db?.users || []).find(u => u.jid === payload?.jid)
         if (!user) throw new Error('User tidak ditemukan di database.')
         if (payload.action === 'toggle_premium') {
            if (user.premium) {
               user.premium = false
               user.expired = 0
               user.limit = Config.limit
            } else {
               user.premium = true
               user.limit += 1000
               user.expired = Date.now() + 30 * 86400000
            }
         } else if (payload.action === 'toggle_ban') {
            user.banned = !user.banned
         } else if (payload.action === 'reset_limit') {
            user.limit = Config.limit
         }
         return reply(true, { msg: `User ${user.name || user.jid} berhasil diperbarui!`, user })
      }

      return reply(false, null, 'Unknown IPC action')
   } catch (e) {
      return reply(false, null, e.message)
   }
})

const connect = async () => {
   try {
      let waVersion = Config.pairing.version
      try {
         const latestWa = await baileys.fetchLatestWaWebVersion()
         if (latestWa?.version && Array.isArray(latestWa.version)) {
            waVersion = latestWa.version
         }
      } catch {
         try {
            const latestBaileys = await baileys.fetchLatestBaileysVersion()
            if (latestBaileys?.version && Array.isArray(latestBaileys.version)) {
               waVersion = latestBaileys.version
            }
         } catch { }
      }

      const client = new Client({
         plugsdir: 'plugins',
         online: true,
         bypass_disappearing: true,
         bot: id => {
            // Detect message from bot by message ID, you can add another logic here
            return id && (id.startsWith('BAE') || /[-]/.test(id))
         },
         custom_id: 'xeon', // Prefix for Custom Message ID (automatically detects isBot for itself)
         presence: true, // Set to 'true' if you want to see the bot typing or recording
         create_session: {
            type: system.session,
            session: 'session',
            config: process.env.DATABASE_URL || ''
         },
         engines: [baileys], // Init baileys as main engine
         debug: false // Set to 'true' if you want to see how this module works :v
      }, {
         // This is the Baileys connection options section
         version: waVersion, // Auto-fetched latest WA Web version with fallback to Config.pairing.version
         browser: Config.pairing.browser,
         shouldIgnoreJid: jid => {
            return /(newsletter|bot)/.test(jid)
         }
      })

      activeClient = client

      client.once('connect', async res => {
         try {
            await system.proxy.init(models, structure, Config.database)

            const isEmpty = global.db.users.length === 0 && global.db.chats.length === 0

            if (isEmpty) {
               const previous = await system.database.fetch()

               if (previous && Object.keys(previous).length > 0) {
                  console.dim('[Proxy DB] Old data found, starting migration...')
                  await system.proxy.migrate(previous, structure)
                  console.dim('[Proxy DB] Migration successful!')
               }
            }

            // Restore config.json & persona.txt backup from DB if present (useful on Render ephemeral disk)
            if (global.db?.setting?._webConfigBackup) {
               let localCfg = {}
               try {
                  localCfg = JSON.parse(await fsPromise.readFile('./config.json', 'utf-8'))
               } catch { }
               const b = { ...global.db.setting._webConfigBackup, ...localCfg }
               Object.assign(Config, b)
               global.db.setting._webConfigBackup = b
               await fsPromise.writeFile('./config.json', JSON.stringify(b, null, 3), 'utf-8').catch(() => {})
            }

            if (global.db?.setting) {
               if (Config.menuaudio !== undefined) {
                  global.db.setting.menuaudio = Boolean(Config.menuaudio)
               } else if (global.db.setting.menuaudio === undefined) {
                  global.db.setting.menuaudio = models.setting.menuaudio ?? true
               }
            }
            if (global.db?.setting?._webPersonaBackup) {
               await fsPromise.writeFile('./persona.txt', global.db.setting._webPersonaBackup, 'utf-8').catch(() => {})
            }
         } catch (e) {
            Utils.printError(e)
         }

         if (res && typeof res === 'object' && res.message) Utils.logFile(res.message)
      })

      client.register('error', async error => {
         console.log(colors.red(error.message))
         if (error && typeof error === 'object' && error.message) Utils.logFile(error.message)
      })

      client.once('ready', async () => {
         const ramCheck = setInterval(() => {
            var ramUsage = process.memoryUsage().rss
            if (ramUsage >= bytes(Config.ram_limit)) {
               clearInterval(ramCheck)
               process.send('reset')
            }
         }, 60 * 1000)

         cron.schedule('0 12 * * *', async () => {
            if (global?.db?.setting?.autobackup) {
               const data = await system.proxy.backup(structure, Config.database)
               const now = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()).replace(', ', '_').replace(/:/g, '-')
               const filename = `${Config.database}-${now}.json`
               await fsPromise.writeFile(filename, data, 'utf-8')
               const buffer = await fsPromise.readFile(filename)
               await client.sock.sendFile(`${Config.owner}@s.whatsapp.net`, buffer, filename, '', null).then(async () => {
                  await fsPromise.unlink(filename)
               })
            }
         })

         extra(system, client)
      })
   } catch (e) {
      Utils.printError(e)
   }
}

connect().catch(() => connect())