import { AdminTableSkeleton } from "@/components/admin/admin-skeletons";

/** Seven columns: image, name, SKU, category, price, stock, actions. */
export default function ProductsLoading() {
  return <AdminTableSkeleton columns={7} rows={10} controls />;
}
