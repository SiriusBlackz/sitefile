/**
 * One-off: activate a project without Stripe (a comped pilot) and, for an
 * inspection project, set its type and scheme in the same step.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/comp-project.ts <projectId> [--type inspection] [--scheme linear|building|grid] \
 *       [--form nec4_ecc|nec3_ecc|jct|other] [--dcp 28] [--contract-type nec|jct|...]
 *
 * Writes an audit row (subscribe/subscription {comped:true}) so the
 * activation is traceable. Refuses unknown ids. Idempotent.
 */
import postgres from "postgres";

const [projectId, ...rest] = process.argv.slice(2);
if (!projectId || !/^[0-9a-f-]{36}$/.test(projectId)) {
  console.error("usage: comp-project.ts <projectId> [--type inspection] [--scheme linear] [--form nec4_ecc] [--dcp 28] [--contract-type nec]");
  process.exit(1);
}
const arg = (k: string) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const type = arg("--type"); const scheme = arg("--scheme"); const form = arg("--form"); const dcp = arg("--dcp"); const contractType = arg("--contract-type");

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require", prepare: false });
  const [p] = await sql`select id, name, status, project_type, org_id from projects where id = ${projectId}`;
  if (!p) { console.error("project not found"); process.exit(1); }
  console.log("before:", p);
  await sql`update projects set
      status = 'active',
      stripe_subscription_id = null,
      project_type = coalesce(${type ?? null}, project_type),
      location_scheme = coalesce(${scheme ?? null}, location_scheme),
      contract_form = coalesce(${form ?? null}, contract_form),
      contract_type = coalesce(${contractType ?? null}, contract_type),
      default_correction_period_days = coalesce(${dcp ? Number(dcp) : null}, default_correction_period_days),
      updated_at = now()
    where id = ${projectId}`;
  await sql`insert into audit_log (project_id, user_id, action, entity_type, entity_id, metadata)
    values (${projectId}, null, 'subscribe', 'subscription', ${projectId}, ${sql.json({ comped: true, by: "founder-script", type: type ?? null, scheme: scheme ?? null })})`;
  const [after] = await sql`select id, name, status, project_type, location_scheme, contract_form, default_correction_period_days from projects where id = ${projectId}`;
  console.log("after:", after);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
