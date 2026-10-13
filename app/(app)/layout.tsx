import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/features/shell/AppShell";
import { Providers } from "../providers";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </Providers>
  );
}
