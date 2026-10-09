import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";

export const dynamic = "force-dynamic";

/** Who the desk is open for: the tabs it shows follow the role. */
export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  return NextResponse.json({ name: auth.adminName, role: auth.role });
}
