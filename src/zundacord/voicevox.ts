import axios from 'axios'

interface AudioQuery {
    _audioQueryBrand: any
}

interface Speaker {
    readonly name: string
    readonly speaker_uuid: string
    readonly styles: {
        readonly name: string
        readonly id: number
    }[]
    readonly version?: string
}

export interface StyledSpeaker {
    readonly styleId: number
    readonly styleName: string
    readonly speaker: Speaker
}

export interface SpeakerInfo {
    readonly policy: string
}


export class VoiceVoxClient {
    private readonly apiEndpoint: string

    private cachedSpeakers?: Speaker[]
    private cachedSpeakersUUIDMap?: Map<string, Speaker>
    private cachedSpeakersIdMap?: Map<string, StyledSpeaker>

    constructor(apiEndpoint: string) {
        this.apiEndpoint = apiEndpoint
    }

    async getAudio(text: string, speakerId: number = 3): Promise<ArrayBuffer> {
        const query = await this.audioQuery(text, speakerId)
        const audioBuf = await this.synthesis(query, speakerId)
        return audioBuf
    }

    async updateCachedSpeakers() {
        this.cachedSpeakers = await this.speakers()

        // map them
        this.cachedSpeakersUUIDMap = new Map()
        this.cachedSpeakersIdMap = new Map()

        this.cachedSpeakers.map((s) => {
            this.cachedSpeakersUUIDMap?.set(s.speaker_uuid, s)
            s.styles.map((st) => {
                this.cachedSpeakersIdMap?.set(`${st.id}`, {
                    styleId: st.id,
                    styleName: st.name,
                    speaker: s
                })
            })
        })
    }

    async getSpeakers(): Promise<Speaker[]> {
        if (!this.cachedSpeakers) {
            await this.updateCachedSpeakers()
        }

        // TODO: better typing
        // @ts-ignore
        return this.cachedSpeakers
    }

    async getSpeakerByUUID(uuid: string): Promise<Speaker | undefined> {
        if (!this.cachedSpeakersUUIDMap) {
            await this.updateCachedSpeakers()
        }

        return this.cachedSpeakersUUIDMap?.get(uuid)
    }

    async getSpeakerById(id: string): Promise<StyledSpeaker | undefined> {
        if (!this.cachedSpeakersIdMap) {
            await this.updateCachedSpeakers()
        }

        return this.cachedSpeakersIdMap?.get(id)
    }

    async speakers(): Promise<Speaker[]> {
        const url = new URL("/speakers", this.apiEndpoint)
        const resp = await axios.get(url.toString())

        return resp.data as Speaker[]
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

    async speakerInfo(speakerUuid: string): Promise<SpeakerInfo> {
        const url = new URL("/speaker_info", this.apiEndpoint)
        const resp = await axios.get(url.toString(), {
            params: {
                speaker_uuid: speakerUuid
            }
        })

        return resp.data as SpeakerInfo
    }
}
