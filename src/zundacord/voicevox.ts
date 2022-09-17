import axios from 'axios'

interface AudioQuery {
    _audioQueryBrand: any
}

export class VoiceVoxClient {
    private readonly apiEndpoint: string

    constructor(apiEndpoint: string) {
        this.apiEndpoint = apiEndpoint
    }

    async getAudio(text: string, speakerId: number = 3): Promise<ArrayBuffer> {
        const query = await this.audioQuery(text, speakerId)
        const audioBuf = await this.synthesis(query, speakerId)
        return audioBuf
    }

    async audioQuery(text: string, speakerId: number): Promise<AudioQuery> {
        const url = new URL("/audio_query", this.apiEndpoint)
        const resp = await axios.post(url.toString(), null, {
            params: {
                speaker: speakerId,
                text: text
            }
        })

        return resp.data as AudioQuery
    }

    async synthesis(query: AudioQuery, speakerId: number): Promise<ArrayBuffer> {
        const url = new URL("/synthesis", this.apiEndpoint)
        const resp = await axios.post(url.toString(), query, {
            responseType: "arraybuffer",
            params: {
                speaker: speakerId
            }
        })

        return resp.data as ArrayBuffer
    }
}
