# Zundacord

Discord TTS Bot, powered by [VOICEVOX](https://voicevox.hiroshiba.jp/)

# Alpha Version Warning!

This application is still in early development stage and considered unstable.
Please consult the lines below carefully. Use with caution!

- **UNSTABLE**. Really.
- Breaking changes may be introduced **WITHOUT NOTICE**! Always consult the
latest README for usage.
- I won't accept any Pull Request contributions until this application reaches
v1. Bug report and feedback are always appreciated. Thanks!

# Run

## Configuration

1. Create the Discord Application and invite the bot to your Discord server.
    - [Message Content Intent](https://support-dev.discord.com/hc/en-us/articles/4404772028055) is required.
    - Zundacord requires `bot` and `applications.commands` OAuth2 scopes.
    - For bot permissions, Zundacord requires `Connect` and `Speak`.
    - To sum up, your bot invitation URL may look like: `https://discord.com/api/oauth2/authorize?client_id=<APPLICATION_ID>&permissions=3145728&scope=bot%20applications.commands`
2. Copy `.env.example` and create `.env`. Put the Discord bot token to them.

## Run with Docker

```
$ docker compose up
```

## Run with npm

```
$ npm ci
$ npm start
```
