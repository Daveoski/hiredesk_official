"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { AdminDashboard } from "@/components/features/dashboard/admin-dashboard";
import { InterviewerDashboard } from "@/components/features/dashboard/interviewer-dashboard";
import { ManagerDashboard } from "@/components/features/dashboard/manager-dashboard";
import { JobFormDialog } from "@/components/features/job-form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

const DESCRIPTION: Record<Role, string> = {
  company_admin: "How hiring is going across your whole company.",
  hiring_manager: "Your jobs, your candidates and what is waiting on you.",
  interviewer: "Your interviews and the scorecards waiting for you.",
};

// Every signed-in user lands here and sees a dashboard for their own role and work.
export default function OverviewPage() {
  const user = useAuthStore((state) => state.user);
  const [creating, setCreating] = useState(false);
  if (!user) return null;

  return (
    <>
      <PageHeader
        title={`Hello, ${user.full_name.split(" ")[0]}`}
        description={DESCRIPTION[user.role]}
        actions={
          user.role === "hiring_manager" && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New job
            </Button>
          )
        }
      />
      {user.role === "company_admin" && <AdminDashboard />}
      {user.role === "hiring_manager" && <ManagerDashboard />}
      {user.role === "interviewer" && <InterviewerDashboard />}
      {user.role === "hiring_manager" && <JobFormDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}
