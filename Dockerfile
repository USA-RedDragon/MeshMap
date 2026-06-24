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

FROM nginx:1.31.2-alpine@sha256:54f2a904c251d5a34adf545a72d32515a15e08418dae0266e23be2e18c66fefa

WORKDIR /app

COPY --chown=root:root docker/rootfs /
COPY --from=builder /app/dist /usr/share/nginx/html

USER nobody:nogroup
WORKDIR /
CMD ["/start.sh"]
