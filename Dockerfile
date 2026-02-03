FROM node:25.6.0-alpine@sha256:09f7192862e11e31ee586e94e2b51274aafa5416e595fc847f1c5cdcfe5ef652 AS builder

WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm ci --ignore-scripts

COPY src/ /app/src/
COPY index.html /app/
COPY vite.config.js /app/
COPY .env /app/
COPY public/ /app/public/

ARG BASE=/
RUN npm run build -- --base=${BASE}

FROM nginx:1.29.4-alpine@sha256:4870c12cd2ca986de501a804b4f506ad3875a0b1874940ba0a2c7f763f1855b2

WORKDIR /app

COPY --chown=root:root docker/rootfs /
COPY --from=builder /app/dist /usr/share/nginx/html

USER nobody:nogroup
WORKDIR /
CMD ["/start.sh"]
