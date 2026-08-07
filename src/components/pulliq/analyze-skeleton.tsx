import { Skeleton } from "@/components/ui/skeleton";

export function AnalyzeSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      {/* Left */}
      <div className="space-y-4">
        <Skeleton className="aspect-video w-full rounded-3xl" />
        <div className="space-y-2.5">
          <Skeleton className="h-6 w-3/4 rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-24 rounded-full" />
            <Skeleton className="h-4 w-20 rounded-full" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
      {/* Right */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/60 p-4">
            <Skeleton className="h-5 w-28 rounded-lg" />
            <div className="mt-4 space-y-2.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-4 w-20 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
