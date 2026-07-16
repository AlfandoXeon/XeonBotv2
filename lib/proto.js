import chalk from 'chalk'
import fs from 'fs'
import path from 'path'

/**
 * @class Proto
 * @description A class to fetch and update WAProto files from a remote repository.
 */
class Proto {
   /**
    * @private
    * @type {string}
    * @description The base URL for the remote repository.
    */
   #baseUrl = "https://raw.githubusercontent.com/wppconnect-team/wa-proto/refs/heads/main"

   /**
    * @private
    * @type {string}
    * @description The local directory path to save the updated files.
    */
   #outputPath = "./node_modules/baileys/WAProto"

   /**
    * @private
    * @description Fetches text content from a given URL.
    * @param {string} url - The URL to fetch content from.
    * @returns {Promise<string>} The text content from the URL.
    */
   async #fetchContentFromUrl(url) {
      try {
         const response = await fetch(url)
         if (!response.ok) {
            throw new Error(`Failed to fetch from ${url}: ${response.statusText}`)
         }
         return await response.text()
      } catch (error) {
         console.error("Error fetching content:", error)
         return ""
      }
   }

   /**
    * @private
    * @description Replaces all occurrences of 'waproto' with 'proto'.
    * @param {string} content - The content to be processed.
    * @returns {string} The processed content.
    */
   #replaceProtoInContent(content) {
      return content.replaceAll("waproto", "proto")
   }

   /**
    * @private
    * @description Applies specific transformations to the index.js content.
    * @param {string} content - The original index.js content.
    * @returns {string} The transformed index.js content.
    */
   #transformIndexJsContent(content) {
      return content
         .replace(/var (\$protobuf) = require\((["']protobufjs\/minimal["'])\)/, "import $1 from $2")
         .replace(/(protobufjs\/minimal)/, "$1.js")
         .replace(/(Message.HistorySyncType) = /, "$1 = Message.HistorySyncNotification.HistorySyncType = ")
         .replace(/(\$root\.proto = )/, "export const proto = $1")
         .replace(/module\.exports = (\$root)/, "export default $1")
   }

   /**
    * @private
    * @description Writes content to a specified file path.
    * @param {string} filePath - The full path of the file to write to.
    * @param {string} content - The content to write.
    */
   #writeFile(filePath, content) {
      try {
         fs.writeFileSync(filePath, content)
         // console.log(chalk.bgGreen(` OK `), `${filePath}`)
      } catch (error) {
         console.error(chalk.red(`Error writing to file ${filePath}`), ':', error)
      }
   }

   /**
    * @public
    * @description Fetches, processes, and saves the WAProto files.
    * @returns {Promise<void>}
    */
   async updateProtoFiles() {
      // Fetch original content
      const rawIndexJs = await this.#fetchContentFromUrl(`${this.#baseUrl}/dist/index.js`)
      const rawIndexDts = await this.#fetchContentFromUrl(`${this.#baseUrl}/dist/index.d.ts`)
      const rawWaProto = await this.#fetchContentFromUrl(`${this.#baseUrl}/WAProto.proto`)

      // Process content
      const processedIndexJs = this.#replaceProtoInContent(rawIndexJs)
      const transformedIndexJs = this.#transformIndexJsContent(processedIndexJs)
      const processedIndexDts = this.#replaceProtoInContent(rawIndexDts)
      const processedWaProto = this.#replaceProtoInContent(rawWaProto)

      // Ensure the output directory exists
      fs.mkdirSync(this.#outputPath, { recursive: true })

      // Write content to files
      this.#writeFile(path.join(this.#outputPath, "index.js"), transformedIndexJs)
      this.#writeFile(path.join(this.#outputPath, "index.d.ts"), processedIndexDts)
      this.#writeFile(path.join(this.#outputPath, "WAProto.proto"), processedWaProto)
   }
}

const updater = new Proto
updater.updateProtoFiles().then(() => {
   console.log(chalk.green('Proto files updated successfully.'))
}).catch((error) => {
   console.error(chalk.red('Error updating proto files'), ':', error)
})