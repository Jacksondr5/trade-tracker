import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700 bg-slate-800/80 p-8 sm:p-10">
        <p className="text-sm font-medium tracking-[0.2em] text-slate-11 uppercase">
          Trade Tracker
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-12 sm:text-5xl">
          Document your trades with a calmer workflow.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-11 sm:text-lg">
          Keep campaigns, trade plans, positions, and notes in one place without
          relying on memory or a pile of disconnected spreadsheets.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
