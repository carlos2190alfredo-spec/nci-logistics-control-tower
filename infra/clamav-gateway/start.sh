#!/bin/sh
# Arranca clamd + freshclam con el init de la imagen oficial y luego el gateway.
/init &
exec node /app/server.mjs
