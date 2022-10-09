import { Zundacord } from "./zundacord/app"
import { logger } from "./zundacord/logger"

// initialize logger
const log = logger.child({ "module": "index" })


log.info("Starting...")

function main() {
    const token = process.env.ZUNDACORD_DISCORD_TOKEN
    if (!token) {
        log.fatal("ZUNDACORD_DISCORD_TOKEN (env) is not set!")
        return
    }

    const apiEndpoint = process.env.ZUNDACORD_VOICEVOX_API_ENDPOINT
    if (!apiEndpoint) {
        log.fatal("ZUNDACORD_VOICEVOX_API_ENDPOINT (env) is not set!")
        return
    }

    const app = new Zundacord(token, apiEndpoint)
    app.start()
}

main()
