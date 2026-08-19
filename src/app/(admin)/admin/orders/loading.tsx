import { AdminTableSkeleton } from "@/components/admin/admin-skeletons";

export default function OrdersLoading() {
  return <AdminTableSkeleton columns={6} rows={10} controls />;
}
