import type { ProjectMemberRole } from "@/server/db/enums";

/** Display labels for project_members.role — shared by the settings team
 * card and the approval-chain snapshot. */
export const MEMBER_ROLE_LABELS: Record<ProjectMemberRole, string> = {
  admin: "Admin",
  member: "Member",
  site_manager: "Site Manager",
  project_manager: "Project Manager",
  construction_manager: "Construction Manager",
  quantity_surveyor: "Quantity Surveyor",
  supervisor: "Supervisor",
};
