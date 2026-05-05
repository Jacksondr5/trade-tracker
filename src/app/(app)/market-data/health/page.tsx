import MarketDataHealthPageClient from "./MarketDataHealthPageClient";

export default function MarketDataHealthPage() {
  // The page reads operational data that updates frequently (jobs, runs,
  // counters), so we skip preloading and let the client subscribe directly.
  return <MarketDataHealthPageClient />;
}
