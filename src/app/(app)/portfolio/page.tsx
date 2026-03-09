import { redirect } from "next/navigation";

export default function LegacyPortfolioIndexRedirect() {
  redirect("/portfolios");
}
