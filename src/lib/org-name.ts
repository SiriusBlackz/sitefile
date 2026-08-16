/**
 * Sign-up auto-creates organisations as "<name>'s Organisation" (Clerk
 * webhook + ensure-user). That placeholder must never print on a client
 * document — detect it so reports and readiness checks can treat the
 * org name as unset until the contractor renames it on the Account page.
 */
export function isPlaceholderOrgName(name: string | null | undefined): boolean {
  if (!name) return true;
  return /'s Organisation$/i.test(name.trim());
}
