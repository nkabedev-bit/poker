import { QrCodesManager } from "@/components/admin/qr-codes-manager";
import { listCardBatches } from "@/lib/cards/card-batch-store";
import { hasPublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function QrCodesPage() {
  // Without Supabase there is nothing to remember; the page still generates and prints.
  if (!hasPublicEnv()) return <QrCodesManager batches={[]} />;

  const supabase = await createSupabaseServerClient();
  const batches = await listCardBatches(supabase);

  return <QrCodesManager batches={batches} />;
}
