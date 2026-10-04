import {
  CalendarCheck,
  CircleCheck,
  CircleX,
  Clock,
  Hourglass,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/calendar-week";

const ICON: Record<string, LucideIcon> = {
  pending: Clock,
  approved: CircleCheck,
  applied: CalendarCheck,
  rejected: CircleX,
  expired: Hourglass,
  failed: TriangleAlert,
};

const VARIANT: Record<string, "outline" | "secondary" | "destructive"> = {
  pending: "outline",
  approved: "secondary",
  applied: "secondary",
  rejected: "outline",
  expired: "outline",
  failed: "destructive",
};

/** Status as an icon and a word, so color is never the only signal. */
export function ProposalStatusBadge({ status }: { status: string }) {
  const Icon = ICON[status] ?? Clock;
  return (
    <Badge variant={VARIANT[status] ?? "outline"}>
      <Icon aria-hidden="true" />
      {statusLabel(status)}
    </Badge>
  );
}
