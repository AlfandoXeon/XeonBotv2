import { askGemini } from '../../../lib/gemini.js'

export const run = {
   async: async (m, {
      client,
      body,
      prefixes,
      users,
      setting,
      plugins
   }) => {
      try {
         // Only run if chatbotai setting is enabled, in private chat, not from ourselves, and not from other bots
         if (!setting.chatbotai || m.isGroup || m.fromMe || m.isBot || !body) return

         // Skip if the message starts with any of the bot command prefixes
         const isCommand = prefixes.some(prefix => body.startsWith(prefix))
         if (isCommand) return

         // Send typing indicator
         await client.sendPresenceUpdate('composing', m.chat)

         // Extract available commands from plugins object
         const commands = []
         if (plugins) {
            for (const [pluginPath, pluginData] of Object.entries(plugins)) {
               const usage = pluginData.run?.usage
               if (usage) {
                  commands.push(...usage)
               }
            }
         }
         const commandListStr = commands.map(cmd => `#${cmd}`).join(', ')

         // Handle replied/quoted message context
         let userPrompt = body
         if (m.quoted && m.quoted.text) {
            userPrompt = `[Context - Pesan yang sedang lu reply/jawab: "${m.quoted.text}"]\n\nPesan baru dari user: ${body}`
         }

         // Query Gemini with the user message, history session, and commands list
         const reply = await askGemini(m.sender, userPrompt, commandListStr)

         // Reply to the user
         await client.reply(m.chat, reply, m)
      } catch (e) {
         console.error('Gemini Chatbot Event Handler Error:', e)
         if (e.message && (e.message.includes('429') || e.message.includes('quota'))) {
            await client.reply(m.chat, `⚠️ *XeonBot AI Limit Notification*\n\nYo bro, sori banget kuota request Gemini API key lu udah abis (kena rate limit 429 dari Google). \n\nCoba tunggu sekitar 1-2 menit lagi ya anjir, atau ganti API Key lu di *config.json* biar gacor lagi!`, m)
         }
      }
   }
}
