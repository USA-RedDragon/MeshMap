FROM node:22.19.0-alpine as builder

WORKDIR /app

COPY package.json package-lock.json /app/

RUN npm ci

COPY src/ /app/src/
COPY index.html /app/
COPY vite.config.js /app/
COPY .env /app/
COPY public/ /app/public/

RUN npm run build

FROM nginx:1.29.1-alpine

WORKDIR /app

RUN apk add --no-cache curl cronie npm nodejs rsyslog python3 py3-pip
RUN sed -i 's/module(load="imklog")//g' /etc/rsyslog.conf

COPY --from=builder /app/dist /usr/share/nginx/html

RUN sed -i "s/#gzip  on;/gzip  on;\n    gzip_vary on;\n    gzip_types text\/plain text\/css application\/json application\/x-javascript application\/javascript text\/xml application\/xml application\/rss\+xml text\/javascript image\/svg\+xml application\/vnd\.ms-fontobject application\/x-font-ttf font\/opentype;/g" /etc/nginx/nginx.conf

COPY --from=ghcr.io/usa-reddragon/mesh-walker:v0.0.1 /mesh-walker /usr/bin/mesh-walker
RUN (crontab -l ; echo "30 * * * * /usr/bin/mesh-walker") | crontab -

RUN touch /var/log/cron.log

ENV PORT=80

RUN <<__DOCKER_EOF__
cat <<__EOF__ > /start
#!/bin/sh

# if /usr/share/nginx/html/data/out.json does not exist, create it
if [ ! -f /usr/share/nginx/html/data/out.json ]; then
  echo "{}" > /usr/share/nginx/html/data/out.json
  /usr/bin/mesh-walker &
fi

echo -n "\${APP_CONFIG}" > /usr/share/nginx/html/appConfig.json

sed -i "s/listen       80;/listen       \${PORT};/g" /etc/nginx/conf.d/default.conf

rsyslogd -n &
crond -m off -s
nginx

exec tail -F /var/log/nginx/access.log /var/log/nginx/error.log /var/log/messages /var/log/cron.log
__EOF__
__DOCKER_EOF__

RUN chmod +x /start

VOLUME [ "/usr/share/nginx/html/data" ]

CMD ["/start"]
