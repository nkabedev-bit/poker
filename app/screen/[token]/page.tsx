import { notFound } from "next/navigation";
import { PublicScreen } from "@/components/public/public-screen";
import { loadPublicState } from "@/lib/public-state";

export const dynamic = "force-dynamic";

type ScreenPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ScreenPage({ params }: ScreenPageProps) {
  const { token } = await params;
  const state = await loadPublicState(token);

  if (!state) notFound();

  return (
    <PublicScreen
      initialState={state}
      serverNowIso={new Date().toISOString()}
      token={token}
    />
  );
}
