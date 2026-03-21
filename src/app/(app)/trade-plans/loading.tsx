export default function TradePlansLoading() {
  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      {/* Page header skeleton */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-9 w-40 animate-pulse rounded bg-olive-3" />
          <div className="h-4 w-72 animate-pulse rounded bg-olive-3" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded-md bg-olive-3" />
      </div>

      {/* Summary stats skeleton */}
      <div className="mb-4 flex gap-4">
        <div className="h-5 w-16 animate-pulse rounded bg-olive-3" />
        <div className="h-5 w-16 animate-pulse rounded bg-olive-3" />
      </div>

      {/* Filter toolbar skeleton */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-9 w-48 animate-pulse rounded-md border border-olive-6 bg-olive-3" />
        <div className="h-9 w-32 animate-pulse rounded-md border border-olive-6 bg-olive-3" />
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
                  <div className="h-5 w-48 animate-pulse rounded bg-olive-3" />
                  <div className="h-4 w-12 animate-pulse rounded bg-olive-3" />
                </div>
                <div className="h-4 w-36 animate-pulse rounded bg-olive-3" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded bg-olive-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
