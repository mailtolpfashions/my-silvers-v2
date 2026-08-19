import { AdminTableSkeleton } from "@/components/admin/admin-skeletons";

export default function CustomersLoading() {
  return <AdminTableSkeleton columns={5} rows={10} controls />;
}
