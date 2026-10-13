import { PoolScreen } from "@/features/pool/PoolScreen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PoolScreen id={Number(id)} />;
}
