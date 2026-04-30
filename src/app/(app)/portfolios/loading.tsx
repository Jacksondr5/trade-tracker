import { Skeleton } from "~/components/ui";

const PLACEHOLDER_ROWS = 5;

export default function PortfoliosLoading() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      {/* Page header skeleton */}
      <div className="mb-6 space-y-2">
        <Skeleton height="xl" className="w-40" />
        <Skeleton height="sm" className="w-80 max-w-full" />
      </div>

      {/* Inline create form skeleton */}
      <div className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Skeleton height="sm" className="w-28" />
            <Skeleton height="xl" className="w-full rounded-md" />
          </div>
          <Skeleton height="xl" className="w-24 rounded-md" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="overflow-x-auto rounded-lg border border-slate-6 bg-slate-2">
        <table className="w-full table-auto">
          <thead>
            <tr className="border-b border-slate-6">
              <th className="px-4 py-2.5 text-left">
                <Skeleton surface="dense" height="sm" className="w-16" />
              </th>
              <th className="px-4 py-2.5 text-right">
                <Skeleton
                  surface="dense"
                  height="sm"
                  className="ml-auto w-12"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: PLACEHOLDER_ROWS }).map((_, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-slate-6/60 last:border-b-0"
              >
                <td className="px-4 py-3">
                  <Skeleton surface="dense" height="sm" className="w-48" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton
                    surface="dense"
                    height="sm"
                    className="ml-auto w-8"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
