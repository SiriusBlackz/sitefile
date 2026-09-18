/**
 * Which modules a project has switched on.
 *
 * Today a project runs in one of two modes: progress reporting, or the
 * defects register. A project is in defects mode if it was created as an
 * inspection project OR a progress project had its defects period started
 * (`defects_enabled_at`). The flag is per-module rather than a type flip
 * so that both workflows can later run side by side on one project
 * without a data migration — at that point this helper stops meaning
 * "defects mode" and the callers that swap screens get revisited.
 *
 * Every screen and procedure that branches on the defects register goes
 * through this helper, never through `projectType` directly.
 */
export type ProjectModuleFields = {
  projectType: string;
  defectsEnabledAt?: Date | string | null;
};

export function hasDefectsModule(project: ProjectModuleFields | null | undefined): boolean {
  if (!project) return false;
  return project.projectType === "inspection" || project.defectsEnabledAt != null;
}
