import { AuthGate } from "~/components/AuthGate";
import { AppShell } from "~/components/app-shell";

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
