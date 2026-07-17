import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs'
import path from 'path'

// Cache to hold chat sessions per user
const chatSessions = new Map()

// Helper to load config dynamically to get latest API key and persona
function getConfig() {
   const configPath = path.join(process.cwd(), 'config.json')
   try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
   } catch (e) {
      console.error('Failed to read config.json in gemini.js:', e)
      return {}
   }
}

/**
 * Gets or creates a Gemini chat session for a user
 * @param {string} sender - The user's WhatsApp ID
 * @returns {any} The generative chat session
 */
export function getChatSession(sender, commandListStr = '') {
   if (chatSessions.has(sender)) {
      return chatSessions.get(sender)
   }

   const config = getConfig()
   const apiKey = config.gemini_api_key
   const basePersona = config.gemini_persona || 'Asisten AI'

   if (!apiKey) {
      throw new Error('Gemini API key is not configured in config.json!')
   }

   // Inject system config and command list into persona
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

   const genAI = new GoogleGenerativeAI(apiKey)
   const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction: systemInstruction
   })

   const chat = model.startChat()
   chatSessions.set(sender, chat)
   return chat
}

/**
 * Sends a message to Gemini and returns the response text
 * @param {string} sender - The user's WhatsApp ID
 * @param {string} message - The incoming message text
 * @param {string} commandListStr - The available commands string
 * @returns {Promise<string>} The response from Gemini
 */
export async function askGemini(sender, message, commandListStr = '') {
   const chat = getChatSession(sender, commandListStr)
   const result = await chat.sendMessage(message)
   return result.response.text()
}
