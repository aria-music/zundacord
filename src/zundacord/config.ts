import * as fs from 'node:fs/promises'
import { logger } from './logger'

const log = logger.child({ "module": "zundacord/config" })


interface Config {
    guilds: { [k: string]: GuildConfig | undefined }
}

interface GuildConfig {
    members: { [k: string]: MemberConfig | undefined }
}

export interface MemberConfig {
    ttsEnabled: boolean
    voiceStyleId?: number
}

export interface IConfigManager {
    init(): Promise<IConfigManager>
    getMemberConfig(guildId: string, userId: string): Promise<MemberConfig>
    setMemberConfig(guildId: string, userId: string, config: MemberConfig): Promise<void>
}

export class JsonConfig implements IConfigManager {
    private configFile = "config/config.json"

    // @ts-ignore
    private config: Config

    async init(): Promise<IConfigManager> {
        let config = await this.readConfig()
        if (!config) {
            // create default config file
            log.info(`no ${this.configFile} found. Creating one...`)
            config = this.defaultConfig()
            this.config = config
            this.writeConfig()
        }

        this.config = config
        return this
    }

    defaultConfig(): Config {
        return {
            guilds: {}
        }
    }

    async readConfig(): Promise<Config | undefined> {
        let configString: string
        try {
            configString = await fs.readFile(this.configFile, {
                encoding: "utf-8"
            })
        } catch (e) {
            log.error(`no ${this.configFile} found.`)
            return
        }

        // TODO: json schema などでチェック？
        const configObj = JSON.parse(configString)
        // TODO: proxy object
        return configObj as Config
    }

    async writeConfig(): Promise<void> {
        await fs.writeFile(this.configFile, JSON.stringify(this.config, undefined, 4))
    }

    async getMemberConfig(guildId: string, userId: string): Promise<MemberConfig> {
        const rawConfig = this.config.guilds[guildId]?.members[userId]
        // populate default value
        return {
            ttsEnabled: true,
            ...rawConfig
        }
    }

    async setMemberConfig(guildId: string, userId: string, config: MemberConfig): Promise<void> {
        if (this.config.guilds[guildId] === undefined) {
            this.config.guilds[guildId] = {
                members: {}
            }
        }

        // @ts-ignore
        this.config.guilds[guildId].members[userId] = config
        this.writeConfig()
    }
}
