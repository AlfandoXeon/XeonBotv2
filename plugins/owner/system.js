import fs from 'node:fs'

export const run = {
   usage: ['autobackup', 'autodownload', 'antispam', 'debug', 'groupmode', 'multiprefix', 'noprefix', 'online', 'self', 'notifier', 'chatbotai', 'menuaudio'],
   use: 'on / off',
   category: 'owner',
   async: async (m, {
      client,
      args,
      isPrefix,
      command,
      Config,
      Utils
   }) => {
      let system = global.db.setting
      let type = command.toLowerCase()
      if (!args || !args[0]) return client.reply(m.chat, `🚩 *Current status* : [ ${system[type] ? 'ON' : 'OFF'} ] (Enter *On* or *Off*)`, m)
      let option = args[0].toLowerCase()
      let optionList = ['on', 'off']
      if (!optionList.includes(option)) return client.reply(m.chat, `🚩 *Current status* : [ ${system[type] ? 'ON' : 'OFF'} ] (Enter *On* or *Off*)`, m)
      let status = option != 'on' ? false : true
      if (system[type] == status) return client.reply(m.chat, Utils.texted('bold', `🚩 ${Utils.ucword(command)} has been ${option == 'on' ? 'activated' : 'inactivated'} previously.`), m)
      system[type] = status
      if (type === 'menuaudio') {
         Config.menuaudio = status
         try {
            const cfgRaw = fs.readFileSync('./config.json', 'utf-8')
            const cfgJson = JSON.parse(cfgRaw)
            cfgJson.menuaudio = status
            fs.writeFileSync('./config.json', JSON.stringify(cfgJson, null, 3), 'utf-8')
            if (system._webConfigBackup) system._webConfigBackup.menuaudio = status
         } catch { }
      }
      client.reply(m.chat, Utils.texted('bold', `🚩 ${Utils.ucword(command)} has been ${option == 'on' ? 'activated' : 'inactivated'} successfully.`), m)
   },
   owner: true
}