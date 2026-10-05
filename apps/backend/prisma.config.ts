import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Same env file selection as the app (see src/app.module.ts).
config({ path: `.env.${process.env.NODE_ENV ?? "development"}` });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need Neon's direct (non-pooled) connection.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
