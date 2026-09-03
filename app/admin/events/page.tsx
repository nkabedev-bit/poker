import { EventsManager } from "@/components/admin/events-manager";
import { hasPublicEnv } from "@/lib/env";
import { countActiveSignups, listEventSignups, listEvents } from "@/lib/events/store";
import type { EventSignupWithPlayer } from "@/lib/events/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  if (!hasPublicEnv()) {
    return <EventsManager events={[]} signupCounts={{}} signups={[]} selectedEventId={null} />;
  }

  const supabase = await createSupabaseServerClient();
  const events = await listEvents(supabase);
  const signupCounts = await countActiveSignups(
    supabase,
    events.map((event) => event.id),
  );

  const selectedEventId = (await searchParams).event ?? null;
  let signups: EventSignupWithPlayer[] = [];
  if (selectedEventId && events.some((event) => event.id === selectedEventId)) {
    signups = await listEventSignups(supabase, selectedEventId);
  }

  return (
    <EventsManager
      events={events}
      selectedEventId={selectedEventId}
      signupCounts={Object.fromEntries(
        [...signupCounts].map(([eventId, taken]) => [eventId, taken.total]),
      )}
      signups={signups}
    />
  );
}
