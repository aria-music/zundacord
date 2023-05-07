# ===== RUNTIME =====

FROM node:18-bullseye as runtime

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
    apt-get -y install --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*


# ===== APP ====

FROM runtime as app

# add sources
COPY --chown=node . /workspaces/zundacord
WORKDIR /workspaces/zundacord

# make ready
RUN su node -c "npm run prod"

# update uid, gid to local user
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupmod --gid $USER_GID node \
    && usermod --uid $USER_UID --gid $USER_GID node \
    && chown -R $USER_UID:$USER_GID /home/node

USER node
ENTRYPOINT []
CMD [ "npm", "start" ]

# ===== DEVELOP =====

FROM runtime as devcontainer

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
    apt-get -y install --no-install-recommends sudo

# sudo
# https://github.com/microsoft/vscode-dev-containers/blob/cda9aea1d48578fe2accf667b65a6c6d147d00d1/script-library/common-debian.sh#L208
RUN echo "node ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/node && \
    chmod 0440 /etc/sudoers.d/node

ARG WORKSPACE_DIR
WORKDIR $WORKSPACE_DIR

# expose npm cache to workspace to enable ci caching
RUN sudo -u node npm config set cache=.npm
