import { StravaCallback } from "@/features/settings/StravaCallback";

export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string; error?: string; scope?: string }> }) {
  const p = await searchParams;
  return <StravaCallback code={p.code ?? null} error={p.error ?? null} scope={p.scope ?? null} />;
}
