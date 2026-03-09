import { CampaignTradePlanHierarchyLayout } from "~/components/app-shell/CampaignTradePlanHierarchyLayout";

export default function CampaignsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <CampaignTradePlanHierarchyLayout>{children}</CampaignTradePlanHierarchyLayout>;
}
