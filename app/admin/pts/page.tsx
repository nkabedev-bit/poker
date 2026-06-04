import { PtsManager } from "@/components/admin/pts-manager";
import { loadAdminExtras } from "@/lib/admin-state";

export default async function PtsPage() {
  const extras = await loadAdminExtras();
  return <PtsManager extras={extras} />;
}
