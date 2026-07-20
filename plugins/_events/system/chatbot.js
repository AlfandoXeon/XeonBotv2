import { askGroq as askGemini } from '../../../lib/groq.js'

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
         // Only run if chatbotai setting is enabled, not from ourselves, not from other bots, and body is not empty
         if (!setting.chatbotai || m.fromMe || m.isBot || !body) return

         // Skip if the message starts with any of the bot command prefixes
         const isCommand = prefixes.some(prefix => body.startsWith(prefix))
         if (isCommand) return

         // In group chats, only respond if the bot is mentioned/tagged or if replying to the bot's message
         if (m.isGroup) {
            const botJid = client.decodeJid(client.user.id)
            const botNumber = botJid.split('@')[0]
            const isMentioned = m.mentionedJid?.map(jid => client.decodeJid(jid)).includes(botJid) ||
                                (m.quoted && client.decodeJid(m.quoted.sender) === botJid) ||
                                body.includes(`@${botNumber}`)
            if (!isMentioned) return
         }

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

         // Extract user first name
         const pushName = m.pushName || m.name || ''
         const firstName = pushName.trim().split(/\s+/)[0] || 'User'

         // Handle replied/quoted message context
         let userPrompt = body
         if (m.quoted && m.quoted.text) {
            userPrompt = `[Context - Pesan yang sedang lu reply/jawab: "${m.quoted.text}"]\n\nPesan baru dari user: ${body}`
         }

         // Query Groq with the user message, history session, user first name, and commands list
         const reply = await askGemini(m.sender, userPrompt, firstName, commandListStr)

         // Reply to the user
         await client.reply(m.chat, reply, m)
      } catch (e) {
         console.error('Chatbot Event Handler Error:', e)
      }
   }
}
