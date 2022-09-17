import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice"
import { Client, GatewayIntentBits, Message } from "discord.js"
import { getReadableString } from "./utils"
import { VoiceVoxClient } from "./voicevox"
import { Player } from "./player"

export class Zundacord {
    private readonly token: string

    private readonly voicevox: VoiceVoxClient
    private readonly client: Client
    private readonly guildPlayers: Map<string, Player> = new Map()

    constructor(token: string, apiEndpoint: string) {
        this.token = token

        this.voicevox = new VoiceVoxClient(apiEndpoint)
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent,
            ]
        })

        // register events
        this.client.on("ready", this.onReady.bind(this))
        this.client.on("messageCreate", this.onMessageCreate.bind(this))
    }

    async start(): Promise<void> {
        await this.client.login(this.token)
    }

    async onReady() {
        console.log("Connected to Discord. Ready.")
    }

    async onMessageCreate(msg: Message) {
        // TODO: slash command
        try {

            if (!msg.inGuild()) {
                console.log("cannot handle non-guild messages")
                return
            }

            if (msg.content === "/join") {
                const conn = getVoiceConnection(msg.guildId)
                if (!conn) {
                    console.log("bot is not in vc. connecting...")
                    if (!msg.member?.id) {
                        console.log("no msg.member.id fuck")
                        return
                    }
                    const member = msg.guild.members.cache.get(msg.member?.id)
                    if (!member) {
                        console.log("no member fuck")
                        return
                    }
                    const chan = member.voice.channel
                    console.log(`chan: ${chan}`)
                    if (chan) {
                        const newConn = joinVoiceChannel({
                            guildId: chan.guildId,
                            channelId: chan.id,
                            adapterCreator: chan.guild.voiceAdapterCreator
                        })
                        newConn.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
                            console.log("Disconnected from voice. Waiting...")
                            try {
                                await Promise.race([
                                    entersState(newConn, VoiceConnectionStatus.Signalling, 5000),
                                    entersState(newConn, VoiceConnectionStatus.Connecting, 5000)
                                ])
                                console.log("Reconnecting starts")
                            } catch (e) {
                                // real disconnect (by user)
                                console.log("Seems disconnected by user. Destroy.")
                                newConn.destroy()
                                // remove current audio player
                                this.guildPlayers.delete(msg.guildId)
                            }
                        })
                        // create audio player
                        const newPlayer = new Player(this.voicevox)
                        newPlayer.setStreamTarget(newConn)
                        this.guildPlayers.set(msg.guildId, newPlayer)
                    }
                }
                return
            }

            const player = this.guildPlayers.get(msg.guildId)
            if (!player) {
                console.log("not in vc, player not found")
                return
            }

            if (msg.content === "skip") {
                player.skipCurrentMessage()
                return
            }

            if (msg.content.startsWith("voice")) {
                const vidStr = msg.content.replace(/^voice/, "")
                const vid = parseInt(vidStr, 10)
                player.setSpeaker(vid)
            }

            console.log(`content: ${msg.content}`)
            const readableStr = getReadableString(msg.content)
            console.log(`readbleStr: ${readableStr}`)

            player.queueMessage(readableStr)

        } catch (e) {
            console.log("fuck")
            console.log(e)
        }
    }
}
