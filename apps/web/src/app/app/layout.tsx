import { PmsShell } from '@/components/pms-shell';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PmsShell>{children}</PmsShell>;
}
