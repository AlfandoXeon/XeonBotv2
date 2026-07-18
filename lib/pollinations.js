import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'

const chatSessions = new Map()

function getConfig() {
   const configPath = path.join(process.cwd(), 'config.json')
   try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
   } catch (e) {
      console.error('Failed to read config.json in pollinations.js:', e)
      return {}
   }
}

export async function askPollinations(sender, message, commandListStr = '') {
   const config = getConfig()
   const basePersona = config.chatbot_persona || 'Asisten AI'

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

Jika user bertanya cara menggunakan fitur, cara download, atau daftar menu, beritahu mereka menggunakan perintah yang sesuai.`

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

   const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json'
      },
      body: JSON.stringify({
         messages: messages,
         model: 'openai',
         json: false
      })
   })

   if (!res.ok) {
      throw new Error(`Pollinations AI error: ${res.status} ${res.statusText}`)
   }

   const replyText = await res.text()

   // Append the assistant response to the history
   history.push({
      role: 'assistant',
      content: replyText
   })

   // Save updated history
   chatSessions.set(sender, history)

   return replyText
}
export const askGemini = askPollinations;
