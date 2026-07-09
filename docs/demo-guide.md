# Demo Guide

1. Iniciar Docker Desktop.
2. Ejecutar `pnpm setup:local`.
3. Ejecutar `pnpm dev`.
4. Abrir `http://localhost:3000`.

Credenciales:

- Plataforma: `platform@nci.local` / `NCIPlatform2026!`
- Operaciones Panatruck: `operaciones@panatruck.local` / `Operaciones2026!`
- Despacho Panatruck: `despacho@panatruck.local` / `Despacho2026!`
- Conductor Panatruck: `conductor1@panatruck.local` / `Conductor2026!`
- Cliente Panatruck: `cliente@clienteportuario.local` / `Cliente2026!`
- Owner TransLogistica: `owner@translogistica.local` / `TransLogistica2026!`
- Cliente TransLogistica: `cliente@distribuciones.local` / `Distribuciones2026!`

Recorrido:

1. Entrar como cliente y crear solicitud.
2. Entrar como operaciones y convertir a viaje.
3. Asignar unidad/conductor desde centro de control.
4. Entrar como conductor y avanzar estados.
5. Registrar incidencia visible al cliente, evidencia y firma.
6. Aprobar evidencia desde operaciones para generar POD PDF.
7. Cerrar desde operaciones.
8. Volver como cliente, consultar cierre, documentos autorizados y descargar POD.
