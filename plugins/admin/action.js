export const run = {
   usage: ['add', 'promote', 'demote', 'kick'],
   use: 'mention or reply',
   category: 'admin tools',
   async: async (m, {
      client,
      text,
      command,
      Utils
   }) => {
      try {
         const args = (m?.mentionedJid?.[0] || m?.quoted?.sender || text)?.trim()
         if (!args) return client.reply(m.chat, Utils.texted('bold', `🚩 Mention or reply chat target.`), m)
         let jid = args.endsWith('lid') ? args : null
         if (!jid) {
            const result = await client.onWhatsApp(args)
            if (!result.length) throw new Error('Invalid number.')
            jid = client.decodeJid(result[0].jid)
         }
         const member = await client.getJidFromParticipants(m.chat, jid)
         if (['kick', 'promote', 'demote'].includes(command)) {
            if (!member) return client.reply(m.chat, Utils.texted('bold', `🚩 Target already left or does not exist in this group.`), m)
            const [json] = await client.groupParticipantsUpdate(m.chat, [member.id], command === 'kick' ? 'remove' : command)
            if (json.status === '200') return m.reply(Utils.texted('bold', `✅ @${member.id?.replace(/@.+/, '')} was ${command === 'kick' ? 'removed' : `${command}d`}`))
            throw new Error('❌ Action failed')
         } else if (command === 'add') {
            // This command may lead to a high risk of your account being banned by WhatsApp.
            if (member) return client.reply(m.chat, Utils.texted('bold', `🚩 @${member.id?.replace(/@.+/, '')} already in this group.`), m)
            const [json] = await client.groupParticipantsUpdate(m.chat, [jid], command)
            if (json.status === '200') return m.reply(Utils.texted('bold', `✅ Successfully added @${jid?.replace(/@.+/, '')} to the group.`))
            throw new Error('❌ Action failed')
         }
      } catch (e) {
         m.reply(Utils.texted('bold', `❌ ${e.message}`))
      }
   },
   group: true,
   admin: true,
   botAdmin: true
}