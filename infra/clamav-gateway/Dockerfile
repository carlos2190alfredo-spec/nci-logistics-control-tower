# Imagen oficial de ClamAV (Alpine) + Node para el gateway HTTPS (ADR-036).
FROM clamav/clamav:1.4
RUN apk add --no-cache nodejs
WORKDIR /app
COPY server.mjs start.sh /app/
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/start.sh"]
