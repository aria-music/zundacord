import axios from 'axios'

interface AudioQuery {
    _audioQueryBrand: any
}

export class VoiceVoxClient {
    private readonly apiEndpoint: string

    constructor(apiEndpoint: string) {
        this.apiEndpoint = apiEndpoint
    }

    async getAudio(text: string): Promise<ArrayBuffer> {
        const query = await this.audioQuery(text)
        const audioBuf = await this.synthesis(query)
        return audioBuf
    }

    async audioQuery(text: string): Promise<AudioQuery> {
        const url = new URL("/audio_query", this.apiEndpoint)
        const resp = await axios.post(url.toString(), null, {
            params: {
                speaker: 3,
                text: text
            }
        })

        return resp.data as AudioQuery
    }

    async synthesis(query: AudioQuery): Promise<ArrayBuffer> {
        const url = new URL("/synthesis", this.apiEndpoint)
        const resp = await axios.post(url.toString(), query, {
            responseType: "arraybuffer",
            params: {
                speaker: 3
            }
        })

        return resp.data as ArrayBuffer
    }
}
