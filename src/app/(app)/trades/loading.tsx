import { Skeleton } from "~/components/ui";

export default function TradesLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page header skeleton */}
      <div className="mb-6 flex items-center justify-between">
        <Skeleton height="xl" className="w-28" />
        <Skeleton height="xl" className="w-28 rounded-md" />
      </div>

      {/* Filter bar skeleton */}
      <div className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton height="sm" className="w-16" />
              <Skeleton height="xl" className="w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div className="overflow-x-auto rounded-lg border border-slate-6">
        <table className="w-full table-auto">
          <thead className="bg-slate-3">
            <tr>
              {Array.from({ length: 11 }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <Skeleton surface="dense" height="sm" className="w-12" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-6 bg-slate-2">
            {Array.from({ length: 10 }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: 11 }).map((_, colIndex) => (
                  <td key={colIndex} className="px-4 py-3">
                    <Skeleton surface="dense" height="sm" className="w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
