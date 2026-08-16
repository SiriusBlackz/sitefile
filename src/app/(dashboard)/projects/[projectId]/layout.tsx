import { ProjectDeskNav } from "@/components/layout/project-desknav";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  // Desk: grouped left rail (The Graft's desknav). Phone: no rail — the
  // project home is the navigator.
  return (
    <div className="flex gap-6">
      <ProjectDeskNav projectId={projectId} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
