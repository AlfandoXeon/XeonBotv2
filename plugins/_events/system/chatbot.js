import { askPollinations as askGemini } from '../../../lib/pollinations.js'

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

         // Query Pollinations with the user message, history session, and commands list
         const reply = await askGemini(m.sender, userPrompt, commandListStr)

         // Reply to the user
         await client.reply(m.chat, reply, m)
      } catch (e) {
         console.error('Chatbot Event Handler Error:', e)
      }
   }
}
