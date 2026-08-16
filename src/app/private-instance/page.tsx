import { SignOutButton } from "@clerk/nextjs";

export default function PrivateInstancePage() {
  return (
    <main className="container mx-auto px-4 py-16">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-700 bg-slate-800/80 p-8 sm:p-10">
        <p className="text-sm font-medium tracking-[0.2em] text-slate-11 uppercase">
          Trade Tracker
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-12 sm:text-4xl">
          This is a private instance.
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-11">
          This Trade Tracker instance is limited to its configured owner. If
          you reached it with another account, please return to your own app.
        </p>
        <SignOutButton redirectUrl="/">
          <button
            className="mt-8 inline-flex rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
            type="button"
          >
            Sign out
          </button>
        </SignOutButton>
      </section>
    </main>
  );
}
