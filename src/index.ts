import { Zundacord } from "./zundacord/app"

const token = process.env.ZUNDACORD_DISCORD_TOKEN
if (!token) {
    throw new Error("environment variable ZUNDACORD_DISCORD_TOKEN is not set")
}

const apiEndpoint = process.env.ZUNDACORD_VOICEVOX_API_ENDPOINT
if (!apiEndpoint) {
    throw new Error("environment variable ZUNDACORD_VOICEVOX_API_ENDPOINT is not set")
}

const app = new Zundacord(token, apiEndpoint)
app.start()
