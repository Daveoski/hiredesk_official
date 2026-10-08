import { Badge } from "@/components/ui/badge";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/stages";
import type { Stage } from "@/lib/types";

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <Badge className="bg-card ring-1 ring-border">
      <span className="size-2 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
      {STAGE_LABEL[stage]}
    </Badge>
  );
}
