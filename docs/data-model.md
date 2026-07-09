# Data Model

Tablas principales implementadas:

- `users`, `sessions`, `password_reset_tokens`
- `tenants`, `tenant_memberships`, `tenant_branding`, `tenant_settings`, `tenant_features`, `tenant_plans`, `tenant_support_sessions`
- `customer_accounts`, `customer_memberships`, `customer_contacts`
- `locations`, `vehicles`, `equipment`, `drivers`, `service_types`
- `service_requests`, `trips`, `trip_events`, `trip_locations`
- `incidents`
- `documents`, `proofs_of_delivery`
- `notification_deliveries`
- `audit_logs`

Restricciones destacadas:

- `tenant.slug` unico global.
- Codigos de vehiculo, conductor, cliente, service request y trip unicos dentro de tenant.
- Indices por `tenant_id` en entidades operativas.
- No se almacenan binarios en PostgreSQL; solo metadata.
