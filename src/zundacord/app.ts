import { AudioPlayer, createAudioPlayer, createAudioResource, getVoiceConnection, joinVoiceChannel, StreamType, VoiceConnection } from "@discordjs/voice"
import { Client, GatewayIntentBits, Message } from "discord.js"
import { getReadableString } from "./utils"
import { VoiceVoxClient } from "./voicevox"
import { Readable } from 'stream'

export class Zundacord {
    private readonly token: string

    private readonly voicevox: VoiceVoxClient
    private readonly client: Client
    private readonly player: AudioPlayer

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
        this.player = createAudioPlayer()

        // register events
        this.client.on("ready", this.onReady.bind(this))
        this.client.on("messageCreate", this.onMessageCreate.bind(this))
        this.client.on("debug", console.log)
        this.client.on("error", console.log)
    }

    async start(): Promise<void> {
        await this.client.login(this.token)
    }

    async onReady() {
        console.log("Connected to Discord. Ready.")
    }

    async onMessageCreate(msg: Message) {
        // TODO: slash command

        if (!msg.inGuild()) {
            console.log("cannot handle non-guild messages")
            return
        }

        if (msg.content === "/join") {
            const conn = getVoiceConnection(msg.guildId)
            console.log(conn)
            if (!conn) {
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
                    joinVoiceChannel({
                        guildId: chan.guildId,
                        channelId: chan.id,
                        adapterCreator: chan.guild.voiceAdapterCreator
                    })
                }
            }
            return
        }

        console.log(`content: ${msg.content}`)
        const readableStr = getReadableString(msg.content)
        console.log(`readbleStr: ${readableStr}`)


        const audio = await this.voicevox.getAudio(readableStr)
        const vc = getVoiceConnection(msg.guildId)
        vc?.on("debug", console.log)
        vc?.on("error", console.log)
        vc?.on('stateChange', console.log)
        if (!vc) {
            console.log("not in vc")
            return
        }

        vc.subscribe(this.player)

        this.player.play(createAudioResource(Readable.from(Buffer.from(audio)), {
            inputType: StreamType.Arbitrary
        }))
    }
}
