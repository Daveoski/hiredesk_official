"use client";

import { useState } from "react";
import { AdminDashboard } from "@/components/features/dashboard/admin-dashboard";
import { InterviewerDashboard } from "@/components/features/dashboard/interviewer-dashboard";
import { ManagerDashboard } from "@/components/features/dashboard/manager-dashboard";
import { JobFormDialog } from "@/components/features/job-form-dialog";
import { useAuthStore } from "@/stores/auth-store";

// Every signed-in user lands here and sees a dashboard for their own role and work.
export default function OverviewPage() {
  const user = useAuthStore((state) => state.user);
  const [creating, setCreating] = useState(false);
  if (!user) return null;

  return (
    <>
      {user.role === "company_admin" && <AdminDashboard user={user} />}
      {user.role === "hiring_manager" && (
        <>
          <ManagerDashboard user={user} onCreateJob={() => setCreating(true)} />
          <JobFormDialog open={creating} onOpenChange={setCreating} />
        </>
      )}
      {user.role === "interviewer" && <InterviewerDashboard user={user} />}
    </>
  );
}
