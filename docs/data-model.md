# Data Model

Tablas principales implementadas:

- `users`, `sessions`, `password_reset_tokens`
- `tenants`, `tenant_memberships`, `tenant_branding`, `tenant_settings`, `tenant_features`, `tenant_plans`, `tenant_support_sessions`
- `customer_accounts`, `customer_memberships`, `customer_contacts`
- `locations`, `vehicles`, `equipment`, `drivers`, `service_types`
- `service_requests`, `trips`, `trip_assignments`, `trip_events`, `trip_locations`
- `incidents`
- `documents`, `proofs_of_delivery`
- `notification_deliveries`
- `audit_logs`

Restricciones destacadas:

- `tenant.slug` unico global.
- Codigos de vehiculo, conductor, cliente, service request y trip unicos dentro de tenant.
- `service_requests.client_request_key` es unico por tenant cuando esta presente para soportar idempotencia desde portal.
- `trip_assignments` conserva historial activo/inactivo de asignaciones por viaje, vehiculo, equipo y conductor.
- Indices por `tenant_id` en entidades operativas.
- No se almacenan binarios en PostgreSQL; solo metadata.
- Evidencias y POD quedan en MinIO; `documents` guarda bucket, object key, MIME, tamano, visibilidad y scope tenant/customer/trip/proof.
