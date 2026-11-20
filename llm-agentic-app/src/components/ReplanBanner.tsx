import Link from "next/link";
import { getUnseenReplans } from "@/lib/services/history";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DismissReplanButton } from "@/components/DismissReplanButton";

export interface ReplanBannerProps {
  learnerId: string;
}

export async function ReplanBanner({ learnerId }: ReplanBannerProps) {
  const replans = await getUnseenReplans(learnerId);

  if (!replans || replans.length === 0) {
    return null;
  }

  const newest = replans[0];
  const version = newest.toVersion ?? 1;
  const reasonText = newest.reason ? `: ${newest.reason}` : "";
  const moreCount = replans.length - 1;

  return (
    <Card size="sm" className="border-primary/20 bg-primary/5 dark:bg-primary/10">
      <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            Your plan was updated to v{version}{reasonText}
          </span>
          {moreCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              +{moreCount} more
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/dashboard/history"
            className="text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80"
          >
            See what changed
          </Link>
          <DismissReplanButton />
        </div>
      </CardContent>
    </Card>
  );
}

export default ReplanBanner;
