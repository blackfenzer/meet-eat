import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // This database also carries Neon's managed-auth tables in a `neon_auth`
  // schema. Restrict drizzle-kit to `public` so it can never plan a drop
  // against them.
  schemaFilter: ["public"],
});
