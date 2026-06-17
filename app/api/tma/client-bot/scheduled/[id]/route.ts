import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const { data, error } = await auth.supabase
    .from("scheduled_broadcasts")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found or not pending" }, { status: 404 });
  return NextResponse.json({ canceled: true, id: data.id });
}
