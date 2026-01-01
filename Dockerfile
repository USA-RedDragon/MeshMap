FROM node:22.21.1-alpine@sha256:0340fa682d72068edf603c305bfbc10e23219fb0e40df58d9ea4d6f33a9798bf AS builder

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

FROM nginx:1.29.4-alpine@sha256:8491795299c8e739b7fcc6285d531d9812ce2666e07bd3dd8db00020ad132295

WORKDIR /app

COPY --chown=root:root docker/rootfs /
COPY --from=builder /app/dist /usr/share/nginx/html

USER nobody:nogroup
WORKDIR /
CMD ["/start.sh"]
