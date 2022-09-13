import { expect, test } from "@jest/globals"
import { getReadableString } from "../../src/zundacord/utils"


test.each([
    // in, expected
    ["hello 🤔", "hello"],
    ["hello <:hello:1234567890>", "hello"],
    ["😎😍😒 hello <:hello:1234567890> <:hello:1234567890> <:hello:1234567890>", "hello"],
    ["<:hello:1234567890> 😎 <:hello:1234567890> hello 🤔 <:hello:1234567890> 🤔", "hello"],
    ["12345hello54321", "12345hello54321"],
    ["プロロのキレ良し？", "プロロのキレ良し？"],
    ["プロロのキレ良し!?", "プロロのキレ良し!?"]
])("getReadableString(%s)", (str, expected) => {
    expect(getReadableString(str)).toBe(expected)
})
