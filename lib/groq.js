import fs from 'fs'
import path from 'path'

const chatSessions = new Map()

function getConfig() {
   const configPath = path.join(process.cwd(), 'config.json')
   try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
   } catch (e) {
      console.error('Failed to read config.json in groq.js:', e)
      return {}
   }
}

function getPersona(config) {
   try {
      const personaPath = path.join(process.cwd(), 'persona.txt')
      if (fs.existsSync(personaPath)) {
         return fs.readFileSync(personaPath, 'utf-8').trim()
      }
   } catch (e) {
      console.warn('Failed to read persona.txt, falling back to config:', e.message)
   }
   return config.chatbot_persona || 'Asisten AI'
}

export async function askGroq(sender, message, userName = '', commandListStr = '') {
   const config = getConfig()
   const apiKey = config.groq_api_key
   if (!apiKey) {
      throw new Error('Groq API Key is not set in config.json!')
   }

   const basePersona = getPersona(config)

   // Define the system message
   const systemInstruction = `${basePersona}

NAMA LAWAN BICARA (PENTING: Gunakan nama ini jika memanggil lawan bicara):
- Nama Panggilan/WhatsApp: ${userName || 'User'}

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

   let replyText = ''
   const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']

   for (const model of models) {
      try {
         const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
               model: model,
               messages: messages,
               temperature: 0.7,
               max_tokens: 1024
            })
         })

         if (!res.ok) {
            const errBody = await res.text()
            throw new Error(`Groq API error (${res.status}): ${errBody}`)
         }

         const data = await res.json()
         replyText = data.choices[0]?.message?.content || ''
         break // Successfully got response, break the model loop
      } catch (e) {
         console.warn(`Groq request failed for model ${model}:`, e.message)
         if (model === models[models.length - 1]) {
            // If the last model failed, throw error
            throw e
         }
      }
   }

   // Append the assistant response to the history
   history.push({
      role: 'assistant',
      content: replyText
   })

   // Save updated history
   chatSessions.set(sender, history)

   return replyText
}
export const askGemini = askGroq;
