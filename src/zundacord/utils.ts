import { toKana } from "wanakana"

// remove emojis, Discord Emoji escapes from string
export function getReadableString(str: string): string {
    let ret = str

    // simple replaces
    ret = ret
        .replace(/\r?\n/g, " ") // seems voicevox reads line breaks
        .replace(/～/g, "ー") // voicevox does not read ～ but does for ー, so replace it
        .replace(/https?:\/\/[^\s]+/g, "リンク") // http(s) url
        .replace(/<a?:[^:]+:[0-9]+>/g, "") // discord emoji & Animated emoji
        .replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, "") // unicode emoji

    // romaji -> hiragana (Discord Game Overlay does not support IME
    // so this is very useful)
    // FIXME: make this configurable per user
    ret = toKana(ret)

    // seems voicevox reads spaces
    ret = ret.trim()

    return ret
}
