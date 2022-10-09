import pino from "pino";

const loglevel = process.env.ZUNDACORD_LOG_LEVEL?.trim().toLowerCase() || "info"

export const logger = pino({
    level: loglevel
})
