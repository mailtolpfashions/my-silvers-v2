import { AdminTableSkeleton } from "@/components/admin/admin-skeletons";

/** Reviews are cards rather than rows, so fewer and taller. */
export default function ReviewsLoading() {
  return <AdminTableSkeleton columns={3} rows={6} controls />;
}
