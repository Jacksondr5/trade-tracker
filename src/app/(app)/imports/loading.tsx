import { Skeleton } from "~/components/ui";

const INBOX_TABLE_COLUMNS = 12;

export default function ImportsLoading() {
  return (
    <div className="container mx-auto px-6 py-8">
      {/* Page header skeleton */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Skeleton height="xl" className="w-28" />
        <div className="ml-auto flex items-center gap-3">
          <Skeleton height="xl" className="w-32 rounded-md" />
          <Skeleton height="xl" className="w-44 rounded-md" />
          <Skeleton height="xl" className="w-32 rounded-md" />
        </div>
      </div>

      {/* Toolbar skeleton */}
      <div className="mb-3 flex items-center gap-3">
        <Skeleton height="lg" className="w-24 rounded-md" />
        <Skeleton height="lg" className="w-24 rounded-md" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-visible rounded-lg border border-slate-6">
        <table className="w-full table-auto">
          <thead className="bg-slate-3">
            <tr>
              <th className="w-8 px-4 py-2" />
              {Array.from({ length: INBOX_TABLE_COLUMNS - 1 }).map((_, i) => (
                <th key={i} className="px-4 py-2">
                  <Skeleton surface="dense" height="sm" className="w-12" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-6 bg-slate-2">
            {Array.from({ length: 4 }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                <td className="px-4 py-3">
                  <Skeleton
                    surface="dense"
                    height="xs"
                    className="mx-auto w-2 rounded-full"
                  />
                </td>
                {Array.from({ length: INBOX_TABLE_COLUMNS - 1 }).map(
                  (_, colIndex) => (
                    <td key={colIndex} className="px-4 py-3">
                      <Skeleton
                        surface="dense"
                        height="sm"
                        className="w-full"
                      />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
