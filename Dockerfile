FROM node:20.5.1-alpine as builder

WORKDIR /app

COPY package.json package-lock.json /app/

RUN npm ci

COPY src/ /app/src/
COPY index.html /app/
COPY vite.config.js /app/
COPY .env /app/
COPY public/ /app/public/

RUN npm run build

FROM nginx:1.25.2-alpine

WORKDIR /app

RUN apk add --no-cache curl cronie npm nodejs rsyslog
RUN npm i -g axios

ENV APP_CONFIG=""

COPY --from=builder /app/dist /usr/share/nginx/html

COPY walk.js /app/

RUN (crontab -l ; echo "30 * * * * node /app/walk.js") | crontab -

RUN <<__DOCKER_EOF__
cat <<__EOF__ > /start
#!/bin/sh

# if /usr/share/nginx/html/data/out.json does not exist, create it
if [ ! -f /usr/share/nginx/html/data/out.json ]; then
  echo "{}" > /usr/share/nginx/html/data/out.json
  node /app/walk.js &
fi

echo -n "${APP_CONFIG}" > /usr/share/nginx/html/appConfig.json

rsyslogd -n &
crond -m off -s
nginx

exec tail -f /var/log/nginx/access.log /var/log/nginx/error.log /var/log/messages
__EOF__
__DOCKER_EOF__

RUN chmod +x /start

VOLUME [ "/usr/share/nginx/html/data" ]

CMD ["/start"]