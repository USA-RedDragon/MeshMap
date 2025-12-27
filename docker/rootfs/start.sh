#!/bin/sh
echo -n "${APP_CONFIG}" > /usr/share/nginx/html/appConfig.json
exec nginx -g "daemon off;"
