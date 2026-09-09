import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dotenv from "dotenv";
import { organisations, users, projects } from "../src/server/db/schema";

dotenv.config({ path: ".env.local" });

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const db = drizzle(client);

  // Create org
  const [org] = await db
    .insert(organisations)
    .values({ name: "Demo Construction Ltd" })
    .returning();

  console.log("Created org:", org.id);

  // Create user
  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      clerkId: "seed_user_001",
      email: "demo@sitefile.app",
      name: "Demo User",
      role: "admin",
    })
    .returning();

  console.log("Created user:", user.id);

  // Create projects
  const projectData = [
    {
      orgId: org.id,
      name: "Riverside Tower Block A",
      reference: "RT-2024-001",
      clientName: "Acme Developments",
      contractType: "design_build",
      startDate: "2024-03-01",
      endDate: "2025-09-30",
      status: "active",
    },
    {
      orgId: org.id,
      name: "Harbour Bridge Repairs",
      reference: "HB-2024-012",
      clientName: "City Council",
      contractType: "nec",
      startDate: "2024-06-15",
      endDate: "2024-12-31",
      status: "active",
    },
    {
      orgId: org.id,
      name: "School Extension Phase 1",
      reference: "SE-2023-005",
      clientName: "County Education Board",
      contractType: "jct",
      startDate: "2023-09-01",
      endDate: "2024-02-28",
      status: "completed",
    },
  ];

  const createdProjects = await db
    .insert(projects)
    .values(projectData)
    .returning();

  console.log(
    "Created projects:",
    createdProjects.map((p) => p.name)
  );

  await client.end();
  console.log("Seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
