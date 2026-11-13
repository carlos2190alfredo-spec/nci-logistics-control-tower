import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Precedencia: variables exportadas > .env.local > .env (dotenv no pisa lo ya definido).
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
