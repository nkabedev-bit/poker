import { EventsManager } from "@/components/admin/events-manager";
import { hasPublicEnv } from "@/lib/env";
import { countActiveSignups, listEventSignups, listEvents } from "@/lib/events/store";
import type { EventSignupWithPlayer } from "@/lib/events/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import { listReservationsForEvents } from "@/lib/events/reservations";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; event?: string; saved?: string }>;
}) {
  const query = await searchParams;
  // What the last save had to say: the form throws nothing at the admin any more.
  const notice = query.error
    ? { kind: "error" as const, text: query.error }
    : query.saved
      ? { kind: "saved" as const, text: query.saved === "1" ? "Афиша сохранена" : query.saved }
      : null;

  if (!hasPublicEnv()) {
    return (
      <EventsManager
        events={[]}
        notice={notice}
        reservations={{}}
        signupCounts={{}}
        signups={[]}
        selectedEventId={null}
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  const events = await listEvents(supabase);
  const { data: tournament } = await supabase.from("tournaments").select("id").limit(1).single();
  const extras = await loadTournamentExtras(tournament?.id as string | undefined, supabase);
  const signupCounts = await countActiveSignups(
    supabase,
    events.map((event) => event.id),
  );

  const reservations = await listReservationsForEvents(
    supabase,
    events.map((event) => event.id),
  );
  const selectedEventId = query.event ?? null;
  let signups: EventSignupWithPlayer[] = [];
  if (selectedEventId && events.some((event) => event.id === selectedEventId)) {
    signups = await listEventSignups(supabase, selectedEventId);
  }

  return (
    <EventsManager
      events={events}
      notice={notice}
      reservations={reservations}
      selectedEventId={selectedEventId}
      signupCounts={Object.fromEntries(
        [...signupCounts].map(([eventId, taken]) => [eventId, taken.total]),
      )}
      signups={signups}
      templates={extras.eventTemplates}
    />
  );
}
