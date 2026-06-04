import { TablesManager } from "@/components/admin/tables-manager";
import { loadAdminExtras } from "@/lib/admin-state";

export default async function TablesPage() {
  const extras = await loadAdminExtras();
  return <TablesManager extras={extras} />;
}
