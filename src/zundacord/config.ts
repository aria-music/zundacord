import { Guild } from 'discord.js'
import * as fs from 'node:fs/promises'

interface Config {
    guilds: { [k: string]: GuildConfig }
}

interface GuildConfig {
    members: { [k: string]: MemberConfig }
}

interface MemberConfig {
    voiceStyleId: number
}

export interface IConfigManager {
    init(): Promise<IConfigManager>
    getMemberVoiceStyleId(guildId: string, userId: string): Promise<number | undefined>
    setMemberVoiceStyleId(guildId: string, userId: string, styleId: number): Promise<void>
}

export class JsonConfig implements IConfigManager {
    private configFile = "config.json"

    // @ts-ignore
    private config: Config

    async init(): Promise<IConfigManager> {
        let config = await this.readConfig()
        if (!config) {
            // create default config file
            console.log(`no ${this.configFile}. Creating one...`)
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
            console.log(`${this.configFile} is missing`)
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

    async getMemberVoiceStyleId(guildId: string, userId: string): Promise<number | undefined> {
        return this.config.guilds[guildId]?.members[userId]?.voiceStyleId
    }

    async setMemberVoiceStyleId(guildId: string, userId: string, styleId: number): Promise<void> {
        if (!this.config.guilds[guildId]) {
            this.config.guilds[guildId] = {
                members: {}
            }
        }

        this.config.guilds[guildId].members[userId] = {
            voiceStyleId: styleId
        }
        this.writeConfig()
    }
}
