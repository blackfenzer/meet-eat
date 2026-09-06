import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

/**
 * An in-memory Postgres (pglite) instance with the real generated migrations
 * applied, so tests run against exactly the schema production runs against.
 * Regenerate migrations with `npx drizzle-kit generate` after changing schema.ts.
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: "./drizzle" });

  return db;
}
