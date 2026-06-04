import type { ReactNode } from "react";
import { Spade } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name, public_token")
    .limit(1)
    .maybeSingle();

  const publicToken = tournament?.public_token ?? "";
  const tournamentName = tournament?.name ?? "POKER CLUB / DEMO";

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-title-row">
          <div className="admin-logo">
            <Spade size={20} />
          </div>
          <div>
            <p className="eyebrow">Новый турнир</p>
            <h1>{tournamentName}</h1>
          </div>
        </div>
        <div className="admin-actions">
          <a className="gold-outline-button" href={`/screen/${publicToken}`} target="_blank">
            Экран для игроков
          </a>
        </div>
      </header>
      <AdminNav publicToken={publicToken} />
      <section className="admin-content">{children}</section>
    </main>
  );
}
