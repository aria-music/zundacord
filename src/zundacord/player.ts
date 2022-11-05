import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, VoiceConnection } from "@discordjs/voice";
import { VoiceVoxClient } from "./voicevox";
import { Readable } from "stream";
import { once } from 'node:events'
import { logger } from "./logger"


interface Message {
    readonly styleId: number
    readonly message: string
}

const log = logger.child({ "module": "zundacord/player" })


export class Player {
    private readonly client: VoiceVoxClient
    private readonly audioPlayer: AudioPlayer

    private readonly msgQueue: Message[] = []
    private readonly audioQueue: Promise<ArrayBuffer>[] = []
    private readonly audioQueueSize: number = 5

    private running: boolean = false

    constructor(client: VoiceVoxClient) {
        this.client = client

        this.audioPlayer = createAudioPlayer()
    }

    setStreamTarget(vc: VoiceConnection) {
        vc.subscribe(this.audioPlayer)
    }

    skipCurrentMessage() {
        this.audioPlayer.stop()
    }

    queueMessage(msg: Message) {
        this.msgQueue.push(msg)
        this.handleMsgQueue()
    }

    handleMsgQueue() {
        // check audioQueue has spaces
        if (this.audioQueue.length > this.audioQueueSize) {
            return
        }

        const msg = this.msgQueue.shift()
        if (!msg) {
            return
        }

        this.audioQueue.push(this.client.getAudio(msg.message, msg.styleId))
        this.handleAudioQueue()
    }

    async handleAudioQueue() {
        if (this.running) {
            return
        }

        this.running = true

        try {
            const awaitableAudio = this.audioQueue.shift()
            if (!awaitableAudio) {
                return
            }
            // fulfill next audio from msgQueue
            this.handleMsgQueue()

            const audio = await awaitableAudio
            this.audioPlayer.play(createAudioResource(Readable.from(Buffer.from(audio))))
            // wait until playback finish
            await once(this.audioPlayer, AudioPlayerStatus.Idle)
        } catch (e) {
            log.error(e, `error while handling audio queue: ${e}`)
        } finally {
            this.running = false
        }

        // repeat until audio queue became empty
        this.handleAudioQueue()
    }
}
