import { Skeleton } from "~/components/ui";

export default function TradePlansLoading() {
  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      {/* Page header skeleton */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton height="xl" className="w-40" />
          <Skeleton height="sm" className="w-72" />
        </div>
        <Skeleton height="xl" className="w-36 rounded-md" />
      </div>

      {/* Summary stats skeleton */}
      <div className="mb-4 flex gap-4">
        <Skeleton height="md" className="w-16" />
        <Skeleton height="md" className="w-16" />
      </div>

      {/* Filter toolbar skeleton */}
      <div className="mb-4 flex items-center gap-3">
        <Skeleton
          height="xl"
          className="w-48 rounded-md border border-olive-6"
        />
        <Skeleton
          height="xl"
          className="w-32 rounded-md border border-olive-6"
        />
      </div>

      {/* Plan row skeletons */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-olive-6 bg-olive-2 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton height="md" className="w-48" />
                  <Skeleton height="sm" className="w-12" />
                </div>
                <Skeleton height="sm" className="w-36" />
              </div>
              <Skeleton height="lg" className="w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
