import Link from "next/link";
import { StageMenu } from "@/components/shared/stage-menu";
import { Avatar } from "@/components/ui/avatar";
import { isManager, useAuthStore } from "@/stores/auth-store";
import type { Application } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function CandidateCard({ application }: { application: Application }) {
  const user = useAuthStore((state) => state.user);
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <Link href={`/candidates/${application.id}`} className="flex items-center gap-3 hover:text-primary">
        <Avatar name={application.full_name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{application.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">Applied {formatDate(application.created_at)}</p>
        </div>
      </Link>
      {isManager(user) && (
        <div className="mt-3 flex justify-end">
          <StageMenu application={application} />
        </div>
      )}
    </div>
  );
}
