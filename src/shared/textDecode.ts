/**
 * Decode a text file whatever editor saved it: UTF-8 (with or without BOM), UTF-16
 * (Notepad "Unicode", by BOM), or — when the bytes aren't valid UTF-8 — Windows-1252,
 * the default of older Windows programs and many song-database exports. Without this,
 * "Señor" from an ANSI file became "Se�or" and UTF-16 files turned into NUL garbage.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start))
  } catch {
    return new TextDecoder('windows-1252').decode(bytes.subarray(start))
  }
}

/**
 * Removes markup tags from imported text (OpenLyrics, OSIS/USFX Bibles, pasted web pages). Repeats until nothing
 * changes, so nested leftovers like "<scr<b>ipt>" can't reassemble into a tag. The result is plain text and is
 * always shown as text, never as HTML.
 */
export function stripTags(s: string): string {
  let prev: string
  let out = s
  do {
    prev = out
    out = out.replace(/<[^<>]*>/g, '')
  } while (out !== prev)
  // a lone "<" left over from broken markup can't open a tag any more
  return out.replace(/<(?=[A-Za-z!/?])/g, '')
}
