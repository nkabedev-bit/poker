import { NextResponse } from "next/server";
import { validateInitData } from "./auth";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

export async function requireTmaAuth(request: Request) {
  const initData = request.headers.get("X-Telegram-Init-Data");
  
  if (!initData) {
    return { error: NextResponse.json({ error: "No init data" }, { status: 401 }) };
  }

  const { ok, userId } = validateInitData(initData);
  
  if (!ok || !userId) {
    return { error: NextResponse.json({ error: "Invalid init data" }, { status: 401 }) };
  }

  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return {
      error: NextResponse.json(
        { error: "Server environment is not configured" },
        { status: 503 },
      ),
    };
  }

  // Используем service role, так как TMA запросы не имеют куки обычной сессии
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: admin } = await supabase
    .from("tma_admins")
    .select("telegram_id, name")
    .eq("telegram_id", userId)
    .maybeSingle();

  if (!admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { userId, adminName: admin.name, supabase };
}
