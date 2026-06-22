FROM node:25.8.2-alpine@sha256:cf38e1f3c28ac9d81cdc0c51d8220320b3b618780e44ef96a39f76f7dbfef023 AS builder

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

FROM nginx:1.31.2-alpine@sha256:1a8724a52d432501548a8d8681bb1554c2d09778f8b9ed0882fc3442549980b7

WORKDIR /app

COPY --chown=root:root docker/rootfs /
COPY --from=builder /app/dist /usr/share/nginx/html

USER nobody:nogroup
WORKDIR /
CMD ["/start.sh"]
