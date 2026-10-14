import { WorkoutScreen } from "@/features/workout/WorkoutScreen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkoutScreen id={id} />;
}
