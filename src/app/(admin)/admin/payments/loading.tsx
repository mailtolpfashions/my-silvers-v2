import { AdminStatsSkeleton, AdminTableSkeleton } from "@/components/admin/admin-skeletons";

/** Figures lead this page, so the stat row is part of the shape it holds. */
export default function PaymentsLoading() {
  return (
    <div className="space-y-6">
      <AdminStatsSkeleton />
      <AdminTableSkeleton columns={7} rows={8} controls />
    </div>
  );
}
