import { expect, test } from "@jest/globals"
import { getReadableString } from "../../src/zundacord/utils"


test.each([
    // in, expected
    ["", ""],
    ["はろー 🤔", "はろー"],
    ["はろー <:hello:1234567890>", "はろー"],
    ["はろー あにめーしょん <a:hello:1234567890>", "はろーあにめーしょん"],
    ["😎😍😒 はろー <:hello:1234567890> <:hello:1234567890> <:hello:1234567890>", "はろー"],
    ["<:hello:1234567890> 😎 <:hello:1234567890> はろー 🤔 <:hello:1234567890> 🤔", "はろー"],
    ["12345はろー54321", "12345はろー54321"],
    ["プロロのキレ良し？", "プロロのキレ良し？"],
    ["プロロのキレ良し!?", "プロロのキレ良し！？"], // this is converted by wanakana's `toKana`
    ["びじっと https://sarisia.cc", "びじっとリンク"],
    ["びじっと http://sarisia.cc", "びじっとリンク"],
    ["びじっと http://sarisia.cc http://sarisia.cc", "びじっとリンクリンク"],
    ["びじっと http://sarisia.cc\nhttp://sarisia.cc", "びじっとリンクリンク"],
    ["かなり\r\nべりー\nふぁすと", "かなりべりーふぁすと"],
    ["すぺーす すぺーす　すぺーす", "すぺーすすぺーすすぺーす"],
    // test `～` -> `ー`
    ["啜る～～～", "啜るーーー"],
    // wanakana tests
    ["wanakana", "わなかな"],
    ["wanakana はろー 😎😍😒 <a:hello:1234567890>", "わなかなはろー"],
])("getReadableString(%s)", (str, expected) => {
    expect(getReadableString(str)).toBe(expected)
})
