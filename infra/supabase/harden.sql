-- Endurecimiento de Supabase para staging (ADR-036).
--
-- La app accede con Prisma usando el rol propio `nci_app`, que crea y es dueño de
-- las tablas (las migraciones corren con ese rol). Sin FORCE ROW LEVEL SECURITY el
-- dueño no queda sujeto a RLS, asi que la app no se ve afectada. Pero Supabase publica el esquema `public`
-- por su Data API (PostgREST) a los roles `anon` y `authenticated`: sin esto,
-- cualquiera con la anon key podria leer o escribir tablas. La app no usa la
-- Data API, se cierra por completo. Idempotente: re-ejecutar tras cada migracion.

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres, nci_app IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres, nci_app IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres, nci_app IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
