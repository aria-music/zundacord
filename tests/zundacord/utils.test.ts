import { expect, test } from "@jest/globals"
import { getReadableString } from "../../src/zundacord/utils"


test.each([
    // in, expected
    ["", ""],
    ["はろー 🤔", "はろー"],
    ["はろー <:hello:1234567890>", "はろー"],
    ["はろー あにめーしょん <a:hello:1234567890>", "はろー あにめーしょん"],
    ["😎😍😒 はろー <:hello:1234567890> <:hello:1234567890> <:hello:1234567890>", "はろー"],
    ["<:hello:1234567890> 😎 <:hello:1234567890> はろー 🤔 <:hello:1234567890> 🤔", "はろー"],
    ["12345はろー54321", "12345はろー54321"],
    ["プロロのキレ良し？", "プロロのキレ良し？"],
    ["プロロのキレ良し!?", "プロロのキレ良し！？"], // this is converted by wanakana's `toKana`
    ["びじっと https://sarisia.cc", "びじっと リンク"],
    ["びじっと http://sarisia.cc", "びじっと リンク"],
    ["びじっと http://sarisia.cc http://sarisia.cc", "びじっと リンク リンク"],
    ["びじっと http://sarisia.cc\nhttp://sarisia.cc", "びじっと リンク リンク"],
    ["かなり\r\nべりー\nふぁすと", "かなり べりー ふぁすと"],
    // test `～` -> `ー`
    ["啜る～～～", "啜るーーー"],
    // wanakana tests
    ["wanakana", "わなかな"],
    ["wanakana はろー 😎😍😒 <a:hello:1234567890>", "わなかな はろー"],
])("getReadableString(%s)", (str, expected) => {
    expect(getReadableString(str)).toBe(expected)
})
