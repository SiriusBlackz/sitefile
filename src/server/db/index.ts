import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
// Importing env validates the entire server-side env at boot — it's
// imported transitively by every tRPC procedure via the db, so a missing
// var fails loudly during dev startup instead of inside a random request.
import { env } from "@/lib/env";

const connectionString = env.DATABASE_URL;

const client = postgres(connectionString, {
  ssl: "require",
  // DATABASE_URL is the Supabase pooler in transaction mode (port 6543):
  // every transaction may land on a different Postgres backend. postgres.js
  // sends its own `commit` as a NAMED prepared statement, so on a backend
  // that never saw it the bind fails, the failure aborts the transaction,
  // and the driver's automatic retry then commits an aborted transaction —
  // which Postgres answers with a silent ROLLBACK and no error. Reproduced
  // 8 Sep 2026: ~50% of db.transaction() writes lost through the dev
  // server, 0% with prepare:false or a direct 5432 connection.
  prepare: false,
});

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

export const db = globalForDb.db ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
