import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-8">
      {/* Header Skeleton */}
      <header className="space-y-3 border-b pb-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28" />
        </div>
      </header>

      {/* Three Module Cards Skeleton */}
      <div className="space-y-6">
        {[1, 2, 3].map((item) => (
          <Card key={item}>
            <CardHeader className="space-y-2 pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1 w-full sm:w-2/3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-3/4" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-4 w-36" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="pt-2 border-t flex items-center gap-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
