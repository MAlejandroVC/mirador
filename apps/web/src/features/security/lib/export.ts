// SYS-23: everything a removed account entered, as one file made on this device from
// the decrypted records. The server never sees what is in it. It is the Mirador backup
// (DAT-01), so it can be restored into any Mirador (DAT-04).
export {
  archiveFile as exportFile,
  archiveFileName as exportFileName,
  archiveFormat as exportFormat,
  archiveVersion as exportVersion,
} from '@repo/archive'

// Hands the file to the browser to save, without it leaving the device.
export function saveFile(contents: string, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}
