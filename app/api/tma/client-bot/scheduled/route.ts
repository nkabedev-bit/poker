import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("scheduled_broadcasts")
    .select("id, message, send_at, status, sent_at, result")
    .order("send_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
