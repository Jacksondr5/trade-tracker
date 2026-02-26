import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import NotesPageClient from "./NotesPageClient";

export default async function NotesPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedNotes = await preloadQuery(
    api.generalNotes.getNotes,
    {},
    { token },
  );

  return <NotesPageClient preloadedNotes={preloadedNotes} />;
}
