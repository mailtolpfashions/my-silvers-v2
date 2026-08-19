import { AdminStatsSkeleton, AdminTableSkeleton } from "@/components/admin/admin-skeletons";

/** The slowest admin route: six queries, one of them across every order line. */
export default function FinanceLoading() {
  return (
    <div className="space-y-6">
      <AdminStatsSkeleton />
      <AdminTableSkeleton columns={5} rows={5} />
    </div>
  );
}
