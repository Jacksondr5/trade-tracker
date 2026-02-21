import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import PositionsPageClient from "./PositionsPageClient";

export default async function PositionsPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedPositions = await preloadQuery(api.positions.getPositions, {}, { token });

  return <PositionsPageClient preloadedPositions={preloadedPositions} />;
}
