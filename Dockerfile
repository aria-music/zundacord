# ===== RUNTIME =====

FROM node:18-bullseye as runtime


# ===== APP ====

FROM runtime as app

# add sources
COPY --chown=node . /workspaces/zundacord
WORKDIR /workspaces/zundacord

# make ready
RUN su node -c "npm ci && npm run build"

USER node
CMD [ "node", "lib/index.js" ]


# ===== DEVELOP =====

FROM runtime as devcontainer

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
    apt-get -y install --no-install-recommends sudo

# sudo
# https://github.com/microsoft/vscode-dev-containers/blob/cda9aea1d48578fe2accf667b65a6c6d147d00d1/script-library/common-debian.sh#L208
RUN echo "node ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/node && \
    chmod 0440 /etc/sudoers.d/node
