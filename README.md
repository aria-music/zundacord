# Zundacord

Discord TTS Bot, powered by [VOICEVOX](https://voicevox.hiroshiba.jp/)

![application screenshot](https://user-images.githubusercontent.com/33576079/224512072-a5485639-ef5c-4db2-a093-dd7b23d6ea04.png)

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
    ![How to enable Message Content Intent](https://user-images.githubusercontent.com/43315234/236633333-98cfc41d-f455-4847-969e-3f56bd4f0a98.png)
    - Zundacord requires `bot` and `applications.commands` OAuth2 scopes. (Look at the figure)
    - For bot permissions, Zundacord requires `Connect` and `Speak`. (Look at the figure)
    ![How to set permission](https://user-images.githubusercontent.com/43315234/236632923-e032ea59-4836-4bd2-bc02-ce538685d350.png)
    - To sum up, your bot invitation URL may look like: `https://discord.com/api/oauth2/authorize?client_id=<APPLICATION_ID>&permissions=3145728&scope=bot%20applications.commands`
    ![How to get bot invitation URL](https://user-images.githubusercontent.com/43315234/236633215-dd1fb18a-a231-40df-b520-6cf259984f99.png)
2. Copy `.env.example` and create `.env`. Put the Discord bot token to them.
    ![How to get bot token](https://user-images.githubusercontent.com/43315234/236633509-8c315ee8-80e9-43a5-8617-920392ae9c48.png)

## Run with Docker

```
$ docker compose up
```

## Run with npm

```
$ npm ci
$ npm start
```
