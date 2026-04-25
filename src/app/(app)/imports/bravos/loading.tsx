import { Skeleton } from "~/components/ui";

export default function BravosImportsLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-96 w-full" />
    </main>
  );
}
