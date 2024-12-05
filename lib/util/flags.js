import {promises as fs} from 'node:fs'
import {join as joinPath} from 'node:path'
import {tmpdir} from 'node:os'
import {genUUID} from './uuid.js'
import {getServerBaseUrl} from './express.js'

/**
 * Reads and outputs the content of the specified flag file and its corresponding '.response' file.
 * After reading, it deletes both files.
 *
 * @param {String} flagId - The identifier of the flag file to read.
 * @returns {Promise<Object>} A promise that resolves with an object containing the contents of the flag file and its response file.
 */
export async function getFlagResponse(flagId) {
  const dirPath = joinPath(tmpdir(), 'flags')
  const filePath = joinPath(dirPath, flagId)
  const responseFilePath = `${filePath}.response`
  const streamFilePath = `${filePath}.stream`

  const payload = {options: null, response: null}
  try {
    // Read the contents of the flag file
    payload.options = JSON.parse(await fs.readFile(filePath, 'utf8'))

    try {
      // Try to read the contents of the response file (if it exists)
      payload.response = await fs.readFile(responseFilePath, 'utf8')
      // Delete flag file and its response file after reading them
      await Promise.all([fs.unlink(filePath), fs.unlink(responseFilePath)])
    } catch {
      try {
        payload.response = await fs.readFile(streamFilePath, 'utf8')
      } catch {}
    }

    console.log(payload)

    return payload
  } catch (error) {
    console.log(error)
  }
}

export function getFlagUrl(flagId, req) {
  const baseUrl = getServerBaseUrl(req)
  const {key} = req.body
  return baseUrl + '/api/flags/' + flagId + '?key=' + key
}

/**
 * Creates a flag file in /tmp/flags with the given slug and JSON options.
 * @param {String} flagSlug - The slug identifiying the flag.
 * @param {Object} options - The options to JSON stringify and write to the file.
 */
export async function createFlag(flagSlug, options = {}, req) {
  const flagId = `${flagSlug}-${genUUID()}`
  options.id = flagId
  options.slug = flagSlug
  const dirPath = joinPath(tmpdir(), 'flags')
  const filePath = joinPath(dirPath, flagId)

  try {
    // Create the directory if it does not exist
    await fs.mkdir(dirPath, {recursive: true})
    // Write the JSON options to the flag file
    await fs.writeFile(filePath, JSON.stringify(options, null, 2))
    // Console.log(`Flag file created successfully at ${filePath}`)
    const flagUrl = getFlagUrl(flagId, req)

    return {id: flagId, url: flagUrl}
  } catch (error) {
    console.error('Error while creating flag file:', error)
  }
}

