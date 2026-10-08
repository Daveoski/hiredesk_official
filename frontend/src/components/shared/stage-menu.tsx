"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useDecide, useMoveStage } from "@/lib/queries";
import { isFinal, MOVABLE_STAGES, STAGE_LABEL } from "@/lib/stages";
import type { Application } from "@/lib/types";

// Managers use this to move a candidate or make the final decision.
// The backend enforces the order of the stages, so a refused move shows the backend message.
export function StageMenu({ application }: { application: Application }) {
  const move = useMoveStage();
  const decide = useDecide();
  const [confirm, setConfirm] = useState<"hired" | "rejected" | null>(null);

  if (isFinal(application.stage)) return null;

  const onMove = (stage: (typeof MOVABLE_STAGES)[number]) =>
    move.mutate(
      { id: application.id, stage },
      {
        onSuccess: () => toast.success(`${application.full_name} moved to ${STAGE_LABEL[stage]}`),
        onError: (error) => toast.error(error.message),
      },
    );

  const onDecide = () => {
    if (!confirm) return;
    decide.mutate(
      { id: application.id, decision: confirm },
      {
        onSuccess: () => {
          toast.success(confirm === "hired" ? `${application.full_name} hired` : `${application.full_name} rejected`);
          setConfirm(null);
        },
        onError: (error) => {
          toast.error(error.message);
          setConfirm(null);
        },
      },
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Move <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
          {MOVABLE_STAGES.map((stage) => (
            <DropdownMenuItem key={stage} disabled={stage === application.stage} onSelect={() => onMove(stage)}>
              {STAGE_LABEL[stage]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={application.stage !== "offer"} onSelect={() => setConfirm("hired")}>
            Hire candidate
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onSelect={() => setConfirm("rejected")}>
            Reject candidate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === "hired" ? `Hire ${application.full_name}?` : `Reject ${application.full_name}?`}
        description={
          confirm === "hired"
            ? "This is the final decision. A candidate can only be hired from the Offer stage."
            : "This is the final decision. The candidate cannot be moved again."
        }
        confirmLabel={confirm === "hired" ? "Hire candidate" : "Reject candidate"}
        destructive={confirm === "rejected"}
        loading={decide.isPending}
        onConfirm={onDecide}
      />
    </>
  );
}
