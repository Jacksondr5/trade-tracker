import { Skeleton } from "~/components/ui";

export default function PortfolioDetailLoading() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      {/* Back link */}
      <Skeleton height="sm" className="mb-3 w-32" />

      {/* Title row */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton height="xl" className="w-64 max-w-full" />
          <Skeleton height="sm" className="w-56" />
        </div>
        <Skeleton height="xl" className="w-28 rounded-md" />
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-olive-6 bg-olive-2 p-4"
          >
            <Skeleton height="sm" className="w-20" />
            <Skeleton height="xl" className="mt-2 w-32" />
          </div>
        ))}
      </div>

      {/* Equity history */}
      <div className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Skeleton height="md" className="w-32" />
          <div className="flex items-center gap-2">
            <Skeleton height="sm" className="w-20" />
            <Skeleton height="lg" className="w-44 rounded-md" />
          </div>
        </div>
        <Skeleton height="xl" className="h-48 w-full rounded-md" />
      </div>

      {/* Allocation */}
      <div className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <Skeleton height="md" className="mb-3 w-28" />
        <Skeleton height="sm" className="mb-3 h-3 w-full rounded-full" />
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Skeleton height="sm" className="w-24" />
            <Skeleton height="md" className="w-28" />
          </div>
          <div className="space-y-1">
            <Skeleton height="sm" className="w-32" />
            <Skeleton height="md" className="w-28" />
          </div>
          <div className="ml-auto space-y-1">
            <Skeleton height="sm" className="w-20" />
            <Skeleton height="md" className="w-28" />
          </div>
        </div>
      </div>

      {/* Open positions table */}
      <div className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <Skeleton height="md" className="mb-3 w-36" />
        <div className="overflow-x-auto rounded-md border border-slate-6 bg-slate-2">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <th key={i} className="px-3 py-2">
                    <Skeleton surface="dense" height="sm" className="w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-slate-6/60 last:border-b-0"
                >
                  {Array.from({ length: 5 }).map((_, colIndex) => (
                    <td key={colIndex} className="px-3 py-3">
                      <Skeleton
                        surface="dense"
                        height="sm"
                        className="w-full"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign exposure */}
      <div className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <Skeleton height="md" className="mb-3 w-44" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-md border border-olive-6 bg-olive-1 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1.5">
                <Skeleton height="sm" className="w-48" />
                <Skeleton height="sm" className="w-64 max-w-full" />
              </div>
              <div className="flex items-center gap-4">
                <div className="space-y-1">
                  <Skeleton height="sm" className="w-16" />
                  <Skeleton height="md" className="w-20" />
                </div>
                <div className="space-y-1">
                  <Skeleton height="sm" className="w-12" />
                  <Skeleton height="md" className="w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cash ledger placeholder */}
      <div className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <Skeleton height="md" className="mb-3 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 py-2">
              <Skeleton height="sm" className="w-24" />
              <Skeleton height="sm" className="w-20 rounded-md" />
              <Skeleton height="sm" className="ml-auto w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
