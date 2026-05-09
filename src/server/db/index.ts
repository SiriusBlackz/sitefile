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
});

const globalForDb = globalThis as unknown as {
  db: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

export const db = globalForDb.db ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
