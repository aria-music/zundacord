import en from './en.json'
import ja from './ja.json'

type Translations = Record<string, string>

const translations: Record<string, Translations> = { en, ja }

export const SUPPORTED_LANGS = ['en', 'ja'] as const
export type Lang = typeof SUPPORTED_LANGS[number]

const _envLang = process.env.ZUNDACORD_LANG?.toLowerCase()
export const DEFAULT_LANG: Lang = (_envLang && (SUPPORTED_LANGS as readonly string[]).includes(_envLang))
    ? _envLang as Lang
    : 'ja'

const fallback: Translations = translations['en']

function resolve(cur: Translations, key: string, params?: Record<string, string>): string {
    let value = cur[key] ?? fallback[key] ?? key
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            value = value.replace(`{${k}}`, v)
        }
    }
    return value
}

export function getLang(userLang?: string): Lang {
    const normalized = userLang?.toLowerCase()
    if (normalized && (SUPPORTED_LANGS as readonly string[]).includes(normalized)) {
        return normalized as Lang
    }
    return DEFAULT_LANG
}

export function t(lang: Lang, key: string, params?: Record<string, string>): string {
    return resolve(translations[lang], key, params)
}
