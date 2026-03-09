import { CampaignTradePlanHierarchyLayout } from "~/components/app-shell/CampaignTradePlanHierarchyLayout";

export default function TradePlansLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <CampaignTradePlanHierarchyLayout>{children}</CampaignTradePlanHierarchyLayout>;
}
