-- Add an optional idempotency key for customer-created service requests.
ALTER TABLE "service_requests" ADD COLUMN "client_request_key" TEXT;
CREATE UNIQUE INDEX "service_requests_tenant_id_client_request_key_key" ON "service_requests"("tenant_id", "client_request_key");
