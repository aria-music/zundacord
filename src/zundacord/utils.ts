// remove emojis, Discord Emoji escapes from string
export function getReadableString(str: string): string {
    return str.replace(/<:.+?:.+?>/g, "").replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, "").trim()
}
