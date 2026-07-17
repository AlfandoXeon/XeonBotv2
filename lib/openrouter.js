import { OpenRouter } from "@openrouter/sdk"
import fs from 'fs'
import path from 'path'

const chatSessions = new Map()

function getConfig() {
   const configPath = path.join(process.cwd(), 'config.json')
   try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
   } catch (e) {
      console.error('Failed to read config.json in openrouter.js:', e)
      return {}
   }
}

export async function askOpenRouter(sender, message, commandListStr = '') {
   const config = getConfig()
   const apiKey = config.openrouter_api_key
   const basePersona = config.chatbot_persona || 'Asisten AI'

   if (!apiKey) {
      throw new Error('OpenRouter API key is not configured in config.json!')
   }

   const openrouter = new OpenRouter({
      apiKey: apiKey
   })

   // Define the system message
   const systemInstruction = `${basePersona}

INFORMASI SISTEM BOT SAAT INI (Gunakan ini untuk menjawab pertanyaan user tentang bot):
- Nama Bot: XeonBot
- Pembuat / Owner: ${config.owner_name} (Nomor: ${config.owner})
- Batas Limit Harian User biasa: ${config.limit} limit
- Batas Ukuran Upload Media: ${config.max_upload_free} MB (Free User) / ${config.max_upload} MB (Premium User)
- Fitur download media (seperti YouTube, Instagram, TikTok) sudah berjalan lancar tanpa API key!

DAFTAR PERINTAH BOT YANG TERSEDIA:
${commandListStr}

Jika user bertanya cara menggunakan fitur, cara download, atau daftar menu, beritahu mereka menggunakan perintah yang sesuai dengan gaya bahasa gahar dan Jaksel-mu.`

   // Retrieve or initialize history
   let history = chatSessions.get(sender) || []

   // Append the user message
   history.push({
      role: 'user',
      content: message
   })

   // Keep only the last 10 messages to avoid token bloat
   if (history.length > 10) {
      history = history.slice(history.length - 10)
   }

   // Prep messages by putting system message at the beginning
   const messages = [
      {
         role: 'system',
         content: systemInstruction
      },
      ...history
   ]

   let response
   try {
      response = await openrouter.chat.send({
         chatRequest: {
            model: 'meta-llama/llama-3.3-70b-instruct:free',
            messages: messages
         }
      })
   } catch (e) {
      console.warn('Llama 3.3:free failed or rate-limited. Falling back to openrouter/free...', e.message)
      response = await openrouter.chat.send({
         chatRequest: {
            model: 'openrouter/free',
            messages: messages
         }
      })
   }

   const replyText = response.choices[0]?.message?.content || ''

   // Append the assistant response to the history
   history.push({
      role: 'assistant',
      content: replyText
   })

   // Save updated history
   chatSessions.set(sender, history)

   return replyText
}
export const askGemini = askOpenRouter;
