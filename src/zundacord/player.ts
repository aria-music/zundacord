import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, VoiceConnection } from "@discordjs/voice";
import { VoiceVoxClient } from "./voicevox";
import { Readable } from "stream";
import { once } from 'node:events'

const SPEAKER_STYLE_ID_DEFAULT = 3

export class Player {
    private readonly client: VoiceVoxClient

    private readonly audioPlayer: AudioPlayer
    // TODO: event-driven queue
    private readonly msgQueue: string[] = []
    private readonly audioQueue: Promise<ArrayBuffer>[] = []
    private readonly audioQueueSize: number = 5

    private running: boolean = false
    private speakerStyleId: number = SPEAKER_STYLE_ID_DEFAULT

    constructor(client: VoiceVoxClient) {
        this.client = client

        this.audioPlayer = createAudioPlayer()
    }

    setStreamTarget(vc: VoiceConnection) {
        vc.subscribe(this.audioPlayer)
    }

    setSpeakerStyle(speakerStyleId: number) {
        this.speakerStyleId = speakerStyleId
    }

    skipCurrentMessage() {
        this.audioPlayer.stop()
    }

    queueMessage(msg: string) {
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

        this.audioQueue.push(this.client.getAudio(msg, this.speakerStyleId))
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
        } finally {
            this.running = false
        }

        // repeat until audio queue became empty
        this.handleAudioQueue()
    }
}
