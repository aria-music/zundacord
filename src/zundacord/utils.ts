// remove emojis, Discord Emoji escapes from string
export function getReadableString(str: string): string {
    return str
        .replace(/https?:\/\/[^\s]+/, "") // http(s) url
        .replace(/<:.+?:.+?>/g, "") // discord emoji
        .replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, "") // unicode emoji
        .trim()
}
