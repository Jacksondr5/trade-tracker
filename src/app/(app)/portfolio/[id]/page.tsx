import { redirect } from "next/navigation";

export default async function LegacyPortfolioDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/portfolios/${id}`);
}
