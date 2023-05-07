import { expect, test } from "@jest/globals"
import { getReadableString } from "../../src/zundacord/utils"


test.each([
    // in, expected
    ["hello 🤔", "hello"],
    ["hello <:hello:1234567890>", "hello"],
    ["hello animation <a:hello:1234567890>", "hello animation"],
    ["😎😍😒 hello <:hello:1234567890> <:hello:1234567890> <:hello:1234567890>", "hello"],
    ["<:hello:1234567890> 😎 <:hello:1234567890> hello 🤔 <:hello:1234567890> 🤔", "hello"],
    ["12345hello54321", "12345hello54321"],
    ["プロロのキレ良し？", "プロロのキレ良し？"],
    ["プロロのキレ良し!?", "プロロのキレ良し!?"],
    ["Visit https://sarisia.cc", "Visit リンク"],
    ["Visit http://sarisia.cc", "Visit リンク"]
])("getReadableString(%s)", (str, expected) => {
    expect(getReadableString(str)).toBe(expected)
})
