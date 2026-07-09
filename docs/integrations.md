# Integrations

Integraciones locales implementadas o preparadas:

- PostgreSQL local por Docker.
- MinIO local compatible S3.
- Mailpit local SMTP/UI.
- `PortalNotificationProvider` por registros en base.
- `LocalEmailProvider` mediante nodemailer/Mailpit.
- `MockWhatsAppProvider` representado por canal `MOCK_WHATSAPP` en notificaciones.
- `DemoGpsProvider` deterministico en `src/lib/domain/gps.ts`.

Preparado para futuro:

- WhatsApp Cloud Provider.
- Email externo.
- Proveedores telematicos como Fitter o genericos.

No hay conexiones reales a servicios externos.
