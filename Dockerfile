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

FROM nginx:1.29.8-alpine@sha256:582c496ccf79d8aa6f8203a79d32aaf7ffd8b13362c60a701a2f9ac64886c93d

WORKDIR /app

COPY --chown=root:root docker/rootfs /
COPY --from=builder /app/dist /usr/share/nginx/html

USER nobody:nogroup
WORKDIR /
CMD ["/start.sh"]
