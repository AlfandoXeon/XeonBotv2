export const run = {
   usage: ['skemo'],
   hidden: ['emoimg'],
   use: 'emoji style',
   category: 'converter',
   async: async (m, {
      client,
      args,
      isPrefix,
      command,
      setting: exif,
      Utils
   }) => {
      try {
         if (!args || !args[0]) return client.reply(m.chat, Utils.example(isPrefix, command, '😳'), m)
         client.sendReact(m.chat, '🕒', m.key)
         const [emoji, style] = args
         const json = await Api.neoxr('/emoimg', {
            q: emoji,
            style: style || 'apple'
         })
         if (!json.status) return client.reply(m.chat, Utils.texted('bold', `🚩 ${json.msg}`), m)
         const buffer = await Utils.fetchAsBuffer(json.data.url)
         client.sendSticker(m.chat, buffer, m, {
            packname: exif.sk_pack,
            author: exif.sk_author,
            categories: [emoji]
         })
      } catch (e) {
         return client.reply(m.chat, Utils.jsonFormat(e), m)
      }
   },
   error: false,
   limit: true
}