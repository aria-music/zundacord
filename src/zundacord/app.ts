import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice"
import { ActionRowBuilder, ActivityType, ApplicationCommandType, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Client, CommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, GatewayIntentBits, Interaction, Message, MessageContextMenuCommandInteraction, Routes, SelectMenuInteraction, SlashCommandBuilder, SlashCommandUserOption, StringSelectMenuBuilder, User, VoiceState } from "discord.js"
import { getReadableString } from "./utils"
import { t, getLang, SUPPORTED_LANGS, DEFAULT_LANG, Lang } from "./i18n"

import { StyledSpeaker, VoiceVoxClient } from "./voicevox"
import { Player } from "./player"
import { IConfigManager, JsonConfig } from "./config"
import { logger } from "./logger"

const COLOR_SUCCESS = 0x47ff94
const COLOR_FAILURE = 0xff4a47
const COLOR_ACTION = 0x45b5ff
const AUTO_DISCONNECT_TIMEOUT = 5000 //ms

const log = logger.child({ "module": "zundacord/app" })


function zundaEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setFooter({ text: "aria-music/zundacord" })
}


export class Zundacord {
    private readonly token: string

    private readonly config: IConfigManager
    private readonly voicevox: VoiceVoxClient
    private readonly client: Client
    private readonly guildPlayers: Map<string, Player> = new Map()

    private applicationId: string = ""

    constructor(token: string, apiEndpoint: string) {
        this.token = token

        this.config = new JsonConfig()
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
        this.client.on("interactionCreate", this.onInteractionCreate.bind(this))
        this.client.on("voiceStateUpdate", this.onVoiceStateUpdate.bind(this));
        log.debug(`registerd cmds`);
    }

    async start(): Promise<void> {
        // init config
        await this.config.init()
        await this.client.login(this.token)
    }

    async onReady() {
        log.info("Connected to Discord!")

        const applicationId = this.client.application?.id
        if (!applicationId) {
            throw new Error("applicationId is missing (BUG)")
        }
        this.applicationId = applicationId
        log.debug(`application id is ${applicationId}`)

        await this.registerCommands()

        this.client.user?.setActivity({
            type: ActivityType.Watching,
            name: t(DEFAULT_LANG, "activity_watching"),
        })
        log.info("Ready!")
    }

    async onInteractionCreate(interaction: Interaction) {
        if (!interaction.inCachedGuild()) {
            // do not handle
            log.debug(`guild not cached: ${interaction.guildId}`)
            return
        }

        if (interaction.isChatInputCommand()) {
            // slash command
            // voice, join, summon, skip, disconnect
            await this.handleSlash(interaction)
        } else if (interaction.isMessageContextMenuCommand()) {
            // context menu command
            // message context: Read this message
            await this.handleContextMenu(interaction)
        } else if (interaction.isStringSelectMenu()) {
            // select menu in command response
            // speakerSelected
            await this.handleSelectMenuResponse(interaction)
        } else if (interaction.isButton()) {
            // button in command response
            // speakerStyleSelected
            await this.handleButtonResponse(interaction)
        } else {
            log.debug(`unknown interaction type: ${interaction.type}`)
        }
    }

    async onMessageCreate(msg: Message) {
        // ignore the bot itself
        if (msg.author.id === this.applicationId) {
            log.debug("ignore the bot itself")
            return
        }

        if (!msg.inGuild()) {
            log.debug("cannot handle non-guild messages")
            return
        }

        const memberConfig = await this.config.getMemberConfig(msg.guildId, msg.author.id)

        if (!memberConfig.ttsEnabled) {
            return
        }

        if (memberConfig?.voiceStyleId === undefined) {
            // user didn't call /voice before,
            // means they haven't agreed to tos yet
            return
        }

        this.queueMessage(msg, memberConfig?.voiceStyleId)
    }

    onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        const vc = getVoiceConnection(newState.guild.id)
        if (!vc) {
            return
        }

        const player = this.guildPlayers.get(newState.guild.id)
        if (!player) {
            log.debug(`bot is not in vc (player not found)`)
            return
        }

        const channel = newState.guild.channels.cache.find(c => c.id === vc.joinConfig.channelId)
        if (channel === undefined || !channel.isVoiceBased()) {
            return
        }

        player.autoDisconnect(vc, channel, this.applicationId, AUTO_DISCONNECT_TIMEOUT);
    }

    async slashVoice(interaction: ChatInputCommandInteraction<"cached">) {
        let user = interaction.user

        const inspectUser = interaction.options.getUser("inspect-user")
        log.debug(`inspectUser: ${inspectUser}`)
        if (inspectUser) {
            user = inspectUser
        }

        const requesterConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const lang = requesterConfig.lang

        const memberConfig = inspectUser
            ? await this.config.getMemberConfig(interaction.guildId, user.id)
            : requesterConfig
        let speaker: StyledSpeaker | undefined
        if (memberConfig?.voiceStyleId !== undefined) {
            speaker = await this.voicevox.getSpeakerById(`${memberConfig.voiceStyleId}`)
        }

        interaction.reply({
            ephemeral: true,
            embeds: [
                this.renderEmbedUserConfigurations(lang, speaker, inspectUser ?? undefined, memberConfig.ttsEnabled)
            ],
            components: !inspectUser ? [
                this.renderButtonSelectTtsEnabled(lang, memberConfig.ttsEnabled),
                await this.renderMenuSelectVoiceSpeaker(lang)
            ] : undefined
        })
    }

    async handleSlash(interaction: ChatInputCommandInteraction<"cached">) {
        const ctx = {
            guild: interaction.guild.name,
            guildId: interaction.guildId,
            user: interaction.member.displayName,
            userId: interaction.member.id,
            commandName: interaction.commandName
        }

        log.debug(ctx, "handling slash command")

        try {
            switch (interaction.commandName) {
                case "voice":
                    await this.slashVoice(interaction)
                    break
                case "join":
                case "summon":
                    await this.slashJoin(interaction)
                    break
                case "skip":
                    await this.slashSkip(interaction)
                    break
                case "disconnect":
                    await this.slashDisconnect(interaction)
                    break
                case "language":
                    await this.slashLanguage(interaction)
                    break
                default:
                    log.debug(ctx, `unknown slash command: ${interaction.commandName}`)
                    throw new Error("unknown slash command (this is internal error)")
            }
        } catch (e) {
            log.error({ ...ctx, err: e }, `unhandled error`)
            try {
                interaction.reply({
                    ephemeral: true,
                    embeds: [
                        zundaEmbed()
                            .setColor(COLOR_FAILURE)
                            .setTitle(t(DEFAULT_LANG, "embed_error_title"))
                            .setDescription(t(DEFAULT_LANG, "embed_error_description"))
                    ]
                })
            } catch (e) {
                log.error(ctx, `failed to send internal error interaction reply (${e})`)
                // do nothing
            }
        }

    }

    async slashJoin(interaction: CommandInteraction<"cached">) {
        const ctx = {
            guild: interaction.guild.name,
            guildId: interaction.guildId,
            user: interaction.member.displayName,
            userId: interaction.member.id,
            commandName: interaction.commandName
        }

        const memberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const lang = memberConfig.lang

        const embed = (() => {
            // join the voice
            // check current voice
            if (getVoiceConnection(interaction.guildId)) {
                log.debug(ctx, "already joined")
                return zundaEmbed()
                    .setColor(COLOR_SUCCESS)
                    .setTitle(t(lang, "embed_join_already_title"))
                    .setDescription(t(lang, "embed_join_already_description"))
            }

            // true join
            log.debug(ctx, "not joined to voice. Joining...")
            const member = interaction.guild.members.cache.get(interaction.user.id)
            if (!member) {
                log.debug(ctx, "not in guild?")
                return zundaEmbed()
                    .setColor(COLOR_FAILURE)
                    .setTitle(t(lang, "embed_join_fail_guild_title"))
                    .setDescription(t(lang, "embed_join_fail_guild_description"))
            }

            const memberVoiceChannel = member.voice.channel
            if (!memberVoiceChannel) {
                log.debug(ctx, "member is not in voice")
                return zundaEmbed()
                    .setColor(COLOR_FAILURE)
                    .setTitle(t(lang, "embed_join_fail_voice_title"))
                    .setDescription(t(lang, "embed_join_fail_voice_description"))
            }

            const vc = joinVoiceChannel({
                guildId: interaction.guildId,
                channelId: memberVoiceChannel.id,
                adapterCreator: interaction.guild.voiceAdapterCreator
            })
            // register disconnection handler
            vc.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
                const vcCtx = {
                    guild: interaction.guild.name,
                    guildId: interaction.guildId,
                    oldState: oldState,
                    newState: newState
                }
                log.info(vcCtx, `Disconnected from voice. Waiting...`)

                try {
                    await Promise.race([
                        entersState(vc, VoiceConnectionStatus.Signalling, 5000),
                        entersState(vc, VoiceConnectionStatus.Connecting, 5000)
                    ])
                    log.info(vcCtx, `Reconnecting starts`)
                } catch (e) {
                    // real disconnect (by user)
                    log.info(vcCtx, `Seems disconnected by user. Destroy.`)
                    vc.destroy()
                    // remove current audio player
                    this.guildPlayers.delete(interaction.guildId)
                }
            })
            // create audio player for this voice channel
            const player = new Player(this.voicevox)
            player.setStreamTarget(vc)
            this.guildPlayers.set(interaction.guildId, player)

            log.debug(ctx, "joined!")
            return zundaEmbed()
                .setColor(COLOR_SUCCESS)
                .setTitle(t(lang, "embed_join_success_title"))
                .setDescription(t(lang, "embed_join_success_description", { channelName: memberVoiceChannel.name }))
        })()

        interaction.reply({
            ephemeral: true,
            embeds: [embed]
        })
    }

    async slashSkip(interaction: CommandInteraction<"cached">) {
        const ctx = {
            guild: interaction.guild.name,
            guildId: interaction.guildId,
            user: interaction.member.displayName,
            userId: interaction.member.id,
            commandName: interaction.commandName
        }

        const memberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const lang = memberConfig.lang

        const embed = (() => {
            const player = this.guildPlayers.get(interaction.guildId)
            if (!player) {
                log.debug(ctx, "bot is not in voice")
                return zundaEmbed()
                    .setColor(COLOR_FAILURE)
                    .setTitle(t(lang, "embed_skip_fail_title"))
                    .setDescription(t(lang, "embed_skip_fail_description"))
            }

            player.skipCurrentMessage()
            log.debug(ctx, "skipped")
            return zundaEmbed()
                .setColor(COLOR_SUCCESS)
                .setTitle(t(lang, "embed_skip_success_title"))
                .setDescription(t(lang, "embed_skip_success_description"))
        })()

        interaction.reply({
            ephemeral: true,
            embeds: [embed]
        })
    }

    async slashDisconnect(interaction: CommandInteraction<"cached">) {
        const ctx = {
            guild: interaction.guild.name,
            guildId: interaction.guildId,
            user: interaction.member.displayName,
            userId: interaction.member.id,
            commandName: interaction.commandName
        }

        const memberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const lang = memberConfig.lang

        const embed = (() => {
            // disconnect from voice
            // check current voice state
            const vc = getVoiceConnection(ctx.guildId)
            if (!vc) {
                return zundaEmbed()
                    .setColor(COLOR_FAILURE)
                    .setTitle(t(lang, "embed_disconnect_fail_title"))
                    .setDescription(t(lang, "embed_disconnect_fail_description"))
            }

            // true disconnect
            log.debug(ctx, "the bot is in voice. Disconnecting...")
            try {
                vc.destroy()
            } catch (e) {
                log.error({ ...ctx, err: e }, `unhandled error`)
                return zundaEmbed()
                    .setColor(COLOR_FAILURE)
                    .setTitle(t(lang, "embed_error_title"))
                    .setDescription(t(lang, "embed_error_description"))
            }
            log.debug(ctx, `disconnected by ${ctx.user}`)
            return zundaEmbed()
                .setColor(COLOR_SUCCESS)
                .setTitle(t(lang, "embed_disconnect_success_title"))
                .setDescription(t(lang, "embed_disconnect_success_description"))
        })()

        interaction.reply({
            ephemeral: true,
            embeds: [embed]
        })
    }

    async handleContextMenu(interaction: MessageContextMenuCommandInteraction<"cached">) {
        const ctx = {
            guild: interaction.guild.name,
            guildId: interaction.guildId,
            user: interaction.member.displayName,
            userId: interaction.member.id,
            commandName: interaction.commandName
        }

        log.debug(ctx, "handling context menu command")

        try {
            switch (interaction.commandName) {
                case t(DEFAULT_LANG, "cmd_read_name"):
                    await this.contextMenuReadThisMessage(interaction)
                    break
                default:
                    log.debug(ctx, `unknown message context menu command: ${interaction.commandName}`)
                    throw new Error("unknown message context menu command (this is internal error)")
            }
        } catch (e) {
            log.error({ ...ctx, err: e }, `unhandled error`)
            try {
                interaction.reply({
                    ephemeral: true,
                    embeds: [
                        zundaEmbed()
                            .setColor(COLOR_FAILURE)
                            .setTitle(t(DEFAULT_LANG, "embed_error_title"))
                            .setDescription(t(DEFAULT_LANG, "embed_error_description"))
                    ]
                })
            } catch (e) {
                log.error(ctx, `failed to send internal error interaction reply (${e})`)
                // do nothing
            }
        }
    }

    async contextMenuReadThisMessage(interaction: MessageContextMenuCommandInteraction<"cached">) {
        const memberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const lang = memberConfig.lang

        if (!memberConfig.ttsEnabled) {
            interaction.reply({
                ephemeral: true,
                embeds: [
                    zundaEmbed()
                        .setColor(COLOR_FAILURE)
                        .setTitle(t(lang, "embed_read_fail_tts_title"))
                        .setDescription(t(lang, "embed_read_fail_tts_description"))
                ]
            })
            return
        }

        if (memberConfig?.voiceStyleId === undefined) {
            interaction.reply({
                ephemeral: true,
                embeds: [
                    zundaEmbed()
                        .setColor(COLOR_FAILURE)
                        .setTitle(t(lang, "embed_read_fail_voice_title"))
                        .setDescription(t(lang, "embed_read_fail_voice_description"))
                ]
            })
            return
        }

        this.queueMessage(interaction.targetMessage, memberConfig.voiceStyleId)
        interaction.reply({
            ephemeral: true,
            embeds: [
                zundaEmbed()
                    .setColor(COLOR_SUCCESS)
                    .setTitle(t(lang, "embed_read_success_title"))
                    .setDescription(t(lang, "embed_read_success_description"))
            ]
        })
    }

    async handleSelectMenuResponse(interaction: SelectMenuInteraction<"cached">) {
        const ctx = {
            guild: interaction.guild.name,
            guildId: interaction.guildId,
            user: interaction.member.displayName,
            userId: interaction.member.id,
            customId: interaction.customId
        }

        log.debug(ctx, "handling select menu response")

        try {
            const cmd = interaction.customId.split("/", 1)[0]
            switch (cmd) {
                case "speakerSelected":
                    await this.selectMenuSpeakerSelected(interaction)
                    break
                default:
                    log.debug(ctx, `unknown select menu response customId: ${interaction.customId}`)
                    throw new Error("unknown select menu response customId (this is internal error)")
            }
        } catch (e) {
            try {
                interaction.update({
                    embeds: [
                        zundaEmbed()
                            .setColor(COLOR_FAILURE)
                            .setTitle(t(DEFAULT_LANG, "embed_error_title"))
                            .setDescription(t(DEFAULT_LANG, "embed_error_description"))
                    ],
                    components: []
                })
            } catch (e) {
                log.error(ctx, `failed to update internal error interaction (${e})`)
                // do nothing
            }
        }
    }

    async selectMenuSpeakerSelected(interaction: SelectMenuInteraction<"cached">) {
        const speakerUuid = interaction.values[0]

        const currentMemberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const lang = currentMemberConfig.lang
        let speaker: StyledSpeaker | undefined
        if (currentMemberConfig?.voiceStyleId !== undefined) {
            speaker = await this.voicevox.getSpeakerById(`${currentMemberConfig.voiceStyleId}`)
        }
        const info = await this.voicevox.speakerInfo(speakerUuid)

        interaction.update({
            embeds: [
                this.renderEmbedUserConfigurations(lang, speaker, undefined, currentMemberConfig.ttsEnabled),
                zundaEmbed()
                    .setColor(COLOR_ACTION)
                    .setTitle(t(lang, "embed_tos_title"))
                    .setDescription(info.policy)
            ],
            components: [
                this.renderButtonSelectTtsEnabled(lang, currentMemberConfig.ttsEnabled),
                await this.renderMenuSelectVoiceSpeaker(lang, speakerUuid),
                ...await this.renderButtonSelectVoiceSpeakerStyle(speakerUuid)
            ]
        })
    }

    async renderMenuSelectVoiceSpeaker(lang: Lang, selectedSpeakerUuid?: string): Promise<ActionRowBuilder<StringSelectMenuBuilder>> {
        // FIXME: this slicing is temporary workaround until we get proper pager implementation
        const speakers = (await this.voicevox.getSpeakers()).slice(0, 25)

        if (!speakers.length) {
            throw new Error("no voice provided from engine?")
        }

        // TODO: make pager
        return new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(new StringSelectMenuBuilder()
                .setCustomId("speakerSelected")
                .setPlaceholder(t(lang, "select_speaker_placeholder"))
                .addOptions(
                    ...speakers.map((s) => {
                        return {
                            label: s.name,
                            description: s.styles.map((st) => {
                                return st.name
                            }).join(", "),
                            value: s.speaker_uuid,
                            default: s.speaker_uuid === selectedSpeakerUuid
                        }
                    })
                )
            )
    }

    async renderButtonSelectVoiceSpeakerStyle(speakerUuid: string): Promise<ActionRowBuilder<ButtonBuilder>[]> {
        const speaker = await this.voicevox.getSpeakerByUUID(speakerUuid)
        if (!speaker) {
            throw new Error(`speakerUuid does not exist: ${speakerUuid}`)
        }

        // TODO: handle case if character has more than 10 styles
        const rows: ActionRowBuilder<ButtonBuilder>[] = []
        // max num of pages (rows): 2
        // page size (entry per page): 5
        const page_size = 5
        for (let i = 0; i < 2; i++) {
            // does this page exists?
            if (speaker.styles.length <= i * page_size) {
                break
            }

            rows.push(new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    ...speaker.styles.slice(i * page_size, (i + 1) * page_size).map((st) => {
                        return new ButtonBuilder()
                            .setLabel(st.name)
                            .setCustomId(`speakerStyleSelected/${st.id}`)
                            .setStyle(ButtonStyle.Primary)
                    })
                )
            )
        }

        return rows
    }

    renderButtonSelectTtsEnabled(lang: Lang, currentTtsEnabled: boolean): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setLabel(t(lang, "button_tts_enable"))
                    .setCustomId("ttsEnabledSelected/enable")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(currentTtsEnabled),
                new ButtonBuilder()
                    .setLabel(t(lang, "button_tts_disable"))
                    .setCustomId("ttsEnabledSelected/disable")
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!currentTtsEnabled)
            )
    }

    async handleButtonResponse(interaction: ButtonInteraction<"cached">) {
        const ctx = {
            guild: interaction.guild.name,
            guildId: interaction.guildId,
            user: interaction.member.displayName,
            userId: interaction.member.id,
            customId: interaction.customId
        }

        log.debug(ctx, "handling button response")

        try {
            const cmd = interaction.customId.split("/", 1)[0]
            switch (cmd) {
                case "speakerStyleSelected":
                    await this.buttonSpeakerStyleSeleceted(interaction)
                    break
                case "ttsEnabledSelected":
                    await this.buttonTtsEnabledSelected(interaction)
                    break
                default:
                    log.debug(ctx, `unknown button response customId: ${interaction.customId}`)
                    throw new Error("unknown button response customId (this is internal error)")
            }
        } catch (e) {
            try {
                interaction.update({
                    embeds: [
                        zundaEmbed()
                            .setColor(COLOR_FAILURE)
                            .setTitle(t(DEFAULT_LANG, "embed_error_title"))
                            .setDescription(t(DEFAULT_LANG, "embed_error_description"))
                    ],
                    components: []
                })
            } catch (e) {
                log.error(ctx, `failed to update internal error interaction (${e})`)
            }
        }
    }

    async buttonSpeakerStyleSeleceted(interaction: ButtonInteraction<"cached">) {
        const styleId = interaction.customId.replace(/^speakerStyleSelected\//, "")

        const memberConfig = (await this.config.getMemberConfig(interaction.guildId, interaction.member.id))
        const lang = memberConfig.lang

        const speaker = await this.voicevox.getSpeakerById(styleId)
        if (!speaker) {
            interaction.update({
                embeds: [
                    zundaEmbed()
                        .setColor(COLOR_FAILURE)
                        .setTitle(t(lang, "embed_set_voice_fail_title"))
                        .setDescription(t(lang, "embed_set_voice_fail_description"))
                ],
                components: []
            })
            return
        }

        memberConfig.voiceStyleId = speaker.styleId
        this.config.setMemberConfig(interaction.guildId, interaction.user.id, memberConfig)
        // TODO: this is useless at this moment due to VOICEVOX engine's limitation
        // see #3
        this.voicevox.doInitializeSpeaker(`${speaker.styleId}`)

        const currentMemberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const info = await this.voicevox.speakerInfo(speaker.speaker.speaker_uuid)

        await interaction.update({
            embeds: [
                this.renderEmbedUserConfigurations(lang, speaker, undefined, currentMemberConfig.ttsEnabled, t(lang, "embed_voice_updated_title"), COLOR_SUCCESS),
                zundaEmbed()
                    .setColor(COLOR_ACTION)
                    .setTitle(t(lang, "embed_tos_title"))
                    .setDescription(info.policy)
            ],
            components: [
                this.renderButtonSelectTtsEnabled(lang, currentMemberConfig.ttsEnabled),
                await this.renderMenuSelectVoiceSpeaker(lang, speaker.speaker.speaker_uuid),
                ...await this.renderButtonSelectVoiceSpeakerStyle(speaker.speaker.speaker_uuid)
            ]
        })
    }

    async buttonTtsEnabledSelected(interaction: ButtonInteraction<"cached">) {
        const enabled = interaction.customId.replace(/^ttsEnabledSelected\//, "") === "enable"

        const memberConfig = (await this.config.getMemberConfig(interaction.guildId, interaction.member.id))
        const lang = memberConfig.lang
        memberConfig.ttsEnabled = enabled
        this.config.setMemberConfig(interaction.guildId, interaction.user.id, memberConfig)

        const currentMemberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const speaker = currentMemberConfig.voiceStyleId != undefined ? await this.voicevox.getSpeakerById(`${currentMemberConfig.voiceStyleId}`) : undefined
        const info = speaker ? await this.voicevox.speakerInfo(speaker.speaker.speaker_uuid) : undefined

        await interaction.update({
            embeds: [
                this.renderEmbedUserConfigurations(lang, speaker, undefined, currentMemberConfig.ttsEnabled, t(lang, "embed_tts_updated_title"), COLOR_SUCCESS),
                ...info ? [zundaEmbed()
                    .setColor(COLOR_ACTION)
                    .setTitle(t(lang, "embed_tos_title"))
                    .setDescription(info.policy)] : []
            ],
            components: [
                this.renderButtonSelectTtsEnabled(lang, currentMemberConfig.ttsEnabled),
                await this.renderMenuSelectVoiceSpeaker(lang, speaker?.speaker.speaker_uuid),
                ...speaker ? await this.renderButtonSelectVoiceSpeakerStyle(speaker.speaker.speaker_uuid) : []
            ]
        })
    }

    renderEmbedUserConfigurations(lang: Lang, speaker?: StyledSpeaker, inspectUser?: User, ttsEnabled?: boolean, title?: string, color?: number): EmbedBuilder {
        const embedHeader = inspectUser ? zundaEmbed()
            .setAuthor({ name: t(lang, "embed_user_config_author", { username: inspectUser.username }), iconURL: inspectUser.displayAvatarURL() })
            .setDescription(t(lang, "embed_user_config_description", { user: inspectUser.toString() }))
            : zundaEmbed()
                .setTitle(title || t(lang, "embed_voice_select_title"));

        return embedHeader
            .setColor(color || COLOR_ACTION)
            .setFields(
                {
                    "name": t(lang, "field_tts_enabled"),
                    "value": ttsEnabled ? t(lang, "field_value_tts_enabled") : t(lang, "field_value_tts_disabled"),
                    "inline": false
                },
                {
                    "name": t(lang, "field_speaker"),
                    "value": speaker?.speaker.name || t(lang, "field_value_not_set"),
                    "inline": true,
                },
                {
                    "name": t(lang, "field_style"),
                    "value": speaker?.styleName || t(lang, "field_value_not_set"),
                    "inline": true,
                },
            )
    }

    async slashLanguage(interaction: ChatInputCommandInteraction<"cached">) {
        const lang = interaction.options.getString("lang", true)

        const memberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const userLang = getLang(lang)
        memberConfig.lang = userLang
        await this.config.setMemberConfig(interaction.guildId, interaction.user.id, memberConfig)

        await interaction.reply({
            ephemeral: true,
            embeds: [
                zundaEmbed()
                    .setColor(COLOR_SUCCESS)
                    .setTitle(t(userLang, "cmd_language_set_title"))
                    .setDescription(t(userLang, "cmd_language_set_description"))
            ]
        })
    }

    async registerCommands() {
        log.info("Registering commands...")

        const commands = [
            new SlashCommandBuilder().setName("voice").setDescription(t(DEFAULT_LANG, "cmd_voice_description"))
                .addUserOption(
                    new SlashCommandUserOption()
                        .setName("inspect-user")
                        .setDescription(t(DEFAULT_LANG, "cmd_voice_inspect_user_description"))
                ),
            new SlashCommandBuilder().setName("join").setDescription(t(DEFAULT_LANG, "cmd_join_description")),
            new SlashCommandBuilder().setName("summon").setDescription(t(DEFAULT_LANG, "cmd_summon_description")),
            new SlashCommandBuilder().setName("skip").setDescription(t(DEFAULT_LANG, "cmd_skip_description")),
            new SlashCommandBuilder().setName("disconnect").setDescription(t(DEFAULT_LANG, "cmd_disconnect_description")),
            new SlashCommandBuilder().setName("language").setDescription(t(DEFAULT_LANG, "cmd_language_description"))
                .addStringOption(opt => opt
                    .setName("lang")
                    .setDescription(t(DEFAULT_LANG, "cmd_language_option_description"))
                    .setRequired(true)
                    .addChoices(...SUPPORTED_LANGS.map(l => ({ name: l === 'ja' ? '日本語' : 'English', value: l })))
                ),
            new ContextMenuCommandBuilder().setName(t(DEFAULT_LANG, "cmd_read_name")).setType(ApplicationCommandType.Message)
        ].map(c => c.toJSON())

        await this.client.rest.put(
            Routes.applicationCommands(this.applicationId),
            { body: commands }
        )

        log.info("Commands are registered!")
    }

    queueMessage(msg: Message<true>, styleId: number) {
        const ctx = {
            guild: msg.guild.name,
            guildId: msg.guildId,
            user: msg.member?.displayName,
            userId: msg.member?.id,
            rawMessage: msg.content,
            styleId: styleId
        }

        const player = this.guildPlayers.get(msg.guildId)
        if (!player) {
            log.debug(ctx, `bot is not in vc (player not found)`)
            return
        }

        const readableStr = getReadableString(msg.cleanContent)
        log.debug(ctx, `readableStr = ${readableStr}`)
        if (!readableStr) {
            log.debug(ctx, `Skip reading as it is empty text`)
            return
        }
        player.queueMessage({
            styleId: styleId,
            message: readableStr,
        })
    }
}
