import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice"
import { ActionRowBuilder, ActivityType, ApplicationCommandType, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Client, CommandInteraction, ContextMenuCommandBuilder, EmbedBuilder, GatewayIntentBits, Interaction, Message, MessageContextMenuCommandInteraction, Routes, SelectMenuBuilder, SelectMenuInteraction, SlashCommandBuilder, SlashCommandUserOption, User } from "discord.js"
import { getReadableString } from "./utils"
import { StyledSpeaker, VoiceVoxClient } from "./voicevox"
import { Player } from "./player"
import { IConfigManager, JsonConfig, MemberConfig } from "./config"
import { logger } from "./logger"

const COLOR_SUCCESS = 0x47ff94
const COLOR_FAILURE = 0xff4a47
const COLOR_ACTION = 0x45b5ff

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
            name: "you! Type /voice to start TTS",
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
            // voice, join, summon, skip
            await this.handleSlash(interaction)
        } else if (interaction.isMessageContextMenuCommand()) {
            // context menu command
            // message context: Read this message
            await this.handleContextMenu(interaction)
        } else if (interaction.isSelectMenu()) {
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

    async slashVoice(interaction: CommandInteraction<"cached">) {
        let user = interaction.user

        const inspectUser = interaction.options.getUser("inspect-user")
        log.debug(`inspectUser: ${inspectUser}`)
        if (inspectUser) {
            user = inspectUser
        }

        const memberConfig = await this.config.getMemberConfig(interaction.guildId, user.id)
        let speaker: StyledSpeaker | undefined
        if (memberConfig?.voiceStyleId !== undefined) {
            speaker = await this.voicevox.getSpeakerById(`${memberConfig.voiceStyleId}`)
        }

        interaction.reply({
            ephemeral: true,
            embeds: [
                this.renderEmbedUserConfigurations(speaker, inspectUser ?? undefined, memberConfig.ttsEnabled)
            ],
            components: !inspectUser ? [
                this.renderButtonSelectTtsEnabled(memberConfig.ttsEnabled),
                await this.renderMenuSelectVoiceSpeaker()
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
                            .setTitle("Internal error")
                            .setDescription("Try again later")
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

        const embed = (() => {
            // join the voice
            // check current voice
            if (getVoiceConnection(interaction.guildId)) {
                log.debug(ctx, "already joined")
                return zundaEmbed()
                    .setColor(COLOR_SUCCESS)
                    .setTitle("Already joined!")
                    .setDescription("The bot is already in voice")
            }

            // true join
            log.debug(ctx, "not joined to voice. Joining...")
            const member = interaction.guild.members.cache.get(interaction.user.id)
            if (!member) {
                log.debug(ctx, "not in guild?")
                return zundaEmbed()
                    .setColor(COLOR_FAILURE)
                    .setTitle("Cannot join")
                    .setDescription("You are not in guild")
            }

            const memberVoiceChannel = member.voice.channel
            if (!memberVoiceChannel) {
                log.debug(ctx, "member is not in voice")
                return zundaEmbed()
                    .setColor(COLOR_FAILURE)
                    .setTitle("Cannot join")
                    .setDescription("You need to join to the voice first")
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
                .setTitle("Joined!")
                .setDescription(`Joined to ${memberVoiceChannel.name}`)
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

        const embed = (() => {
            const player = this.guildPlayers.get(interaction.guildId)
            if (!player) {
                log.debug(ctx, "bot is not in voice")
                return zundaEmbed()
                    .setColor(COLOR_FAILURE)
                    .setTitle("Cannot skip")
                    .setDescription("The bot is not in voice")
            }

            player.skipCurrentMessage()
            log.debug(ctx, "skipped")
            return zundaEmbed()
                .setColor(COLOR_SUCCESS)
                .setTitle("Skipped!")
                .setDescription("Skipped the message")
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
                case "Read this message":
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
                            .setTitle("Internal error")
                            .setDescription("Try again later")
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

        if (!memberConfig.ttsEnabled) {
            interaction.reply({
                ephemeral: true,
                embeds: [
                    zundaEmbed()
                        .setColor(COLOR_FAILURE)
                        .setTitle("Cannot read the message")
                        .setDescription("Enable TTS with /voice command first!")
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
                        .setTitle("Cannot read the message")
                        .setDescription("Set your voice with /voice command first!")
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
                    .setTitle("Successfully enqueued!")
                    .setDescription("The message is successfully enqueued to be read")
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
                            .setTitle("Internal error")
                            .setDescription("Try again later")
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
        let speaker: StyledSpeaker | undefined
        if (currentMemberConfig?.voiceStyleId !== undefined) {
            speaker = await this.voicevox.getSpeakerById(`${currentMemberConfig.voiceStyleId}`)
        }
        const info = await this.voicevox.speakerInfo(speakerUuid)

        interaction.update({
            embeds: [
                this.renderEmbedUserConfigurations(speaker, undefined, currentMemberConfig.ttsEnabled),
                zundaEmbed()
                    .setColor(COLOR_ACTION)
                    .setTitle("You need to agree to the terms of service")
                    .setDescription(info.policy)
            ],
            components: [
                this.renderButtonSelectTtsEnabled(currentMemberConfig.ttsEnabled),
                await this.renderMenuSelectVoiceSpeaker(speakerUuid),
                ...await this.renderButtonSelectVoiceSpeakerStyle(speakerUuid)
            ]
        })
    }

    async renderMenuSelectVoiceSpeaker(selectedSpeakerUuid?: string): Promise<ActionRowBuilder<SelectMenuBuilder>> {
        const speakers = await this.voicevox.getSpeakers()

        if (!speakers.length) {
            throw new Error("no voice provided from engine?")
        }

        // TODO: make pager
        return new ActionRowBuilder<SelectMenuBuilder>()
            .addComponents(new SelectMenuBuilder()
                .setCustomId("speakerSelected")
                .setPlaceholder("Choose the speaker...")
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

    renderButtonSelectTtsEnabled(currentTtsEnabled: boolean): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setLabel("TTS: Enable")
                    .setCustomId("ttsEnabledSelected/enable")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(currentTtsEnabled),
                new ButtonBuilder()
                    .setLabel("TTS: Disable")
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
                            .setTitle("Internal error")
                            .setDescription("Try again later")
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

        const speaker = await this.voicevox.getSpeakerById(styleId)
        if (!speaker) {
            interaction.update({
                embeds: [
                    zundaEmbed()
                        .setColor(COLOR_FAILURE)
                        .setTitle("Cannot set voice")
                        .setDescription("Specified speaker / style is not found")
                ],
                components: []
            })
            return
        }

        const memberConfig = (await this.config.getMemberConfig(interaction.guildId, interaction.member.id))
        memberConfig.voiceStyleId = speaker.styleId
        this.config.setMemberConfig(interaction.guildId, interaction.user.id, memberConfig)
        // TODO: this is useless at this moment due to VOICEVOX engine's limitation
        // see #3
        this.voicevox.doInitializeSpeaker(`${speaker.styleId}`)

        const currentMemberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const info = await this.voicevox.speakerInfo(speaker.speaker.speaker_uuid)

        await interaction.update({
            embeds: [
                this.renderEmbedUserConfigurations(speaker, undefined, currentMemberConfig.ttsEnabled, "Voice is updated!", COLOR_SUCCESS),
                zundaEmbed()
                    .setColor(COLOR_ACTION)
                    .setTitle("You need to agree to the terms of service")
                    .setDescription(info.policy)
            ],
            components: [
                this.renderButtonSelectTtsEnabled(currentMemberConfig.ttsEnabled),
                await this.renderMenuSelectVoiceSpeaker(speaker.speaker.speaker_uuid),
                ...await this.renderButtonSelectVoiceSpeakerStyle(speaker.speaker.speaker_uuid)
            ]
        })
    }

    async buttonTtsEnabledSelected(interaction: ButtonInteraction<"cached">) {
        const enabled = interaction.customId.replace(/^ttsEnabledSelected\//, "") === "enable"

        const memberConfig = (await this.config.getMemberConfig(interaction.guildId, interaction.member.id))
        memberConfig.ttsEnabled = enabled
        this.config.setMemberConfig(interaction.guildId, interaction.user.id, memberConfig)

        const currentMemberConfig = await this.config.getMemberConfig(interaction.guildId, interaction.user.id)
        const speaker = currentMemberConfig.voiceStyleId != undefined ? await this.voicevox.getSpeakerById(`${currentMemberConfig.voiceStyleId}`) : undefined
        const info = speaker ? await this.voicevox.speakerInfo(speaker.speaker.speaker_uuid) : undefined

        await interaction.update({
            embeds: [
                this.renderEmbedUserConfigurations(speaker, undefined, currentMemberConfig.ttsEnabled, "TTS configuration is updated!", COLOR_SUCCESS),
                ...info ? [zundaEmbed()
                    .setColor(COLOR_ACTION)
                    .setTitle("You need to agree to the terms of service")
                    .setDescription(info.policy)] : []
            ],
            components: [
                this.renderButtonSelectTtsEnabled(currentMemberConfig.ttsEnabled),
                await this.renderMenuSelectVoiceSpeaker(speaker?.speaker.speaker_uuid),
                ...speaker ? await this.renderButtonSelectVoiceSpeakerStyle(speaker.speaker.speaker_uuid) : []
            ]
        })
    }

    renderEmbedUserConfigurations(speaker?: StyledSpeaker, inspectUser?: User, ttsEnabled?: boolean, title?: string, color?: number): EmbedBuilder {
        const embedHeader = inspectUser ? zundaEmbed()
            .setAuthor({ name: `${inspectUser.username}'s configuration`, iconURL: inspectUser.displayAvatarURL() })
            .setDescription(`Showing ${inspectUser.toString()}'s configuration`)
            : zundaEmbed()
                .setTitle(title || "Select your voice!");

        return embedHeader
            .setColor(color || COLOR_ACTION)
            .setFields(
                {
                    "name": "TTS Enabled",
                    "value": ttsEnabled ? ":arrow_forward: Enabled" : ":pause_button: Disabled",
                    "inline": false
                },
                {
                    "name": "Speaker",
                    "value": speaker?.speaker.name || "(Not set)",
                    "inline": true,
                },
                {
                    "name": "Style",
                    "value": speaker?.styleName || "(Not set)",
                    "inline": true,
                },
            )
    }

    async registerCommands() {
        log.info("Registering commands...")

        const commands = [
            new SlashCommandBuilder().setName("voice").setDescription("Set the speaker voice / style")
                .addUserOption(
                    new SlashCommandUserOption()
                        .setName("inspect-user")
                        .setDescription("specify username to get user's configurations")
                ),
            new SlashCommandBuilder().setName("join").setDescription("Join the bot to the voice"),
            new SlashCommandBuilder().setName("summon").setDescription("Join the bot to the voice (alias of `/join`)"),
            new SlashCommandBuilder().setName("skip").setDescription("Skip the message reading now"),
            new ContextMenuCommandBuilder().setName("Read this message").setType(ApplicationCommandType.Message)
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
