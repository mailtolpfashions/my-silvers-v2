"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImagesUploader, VideoUploader } from "@/components/admin/media-uploader";
import {
  createProductAction,
  updateProductAction,
} from "@/actions/admin-product-actions";

export type ProductFormValues = {
  name: string;
  description: string;
  shortDescription: string;
  price: string;
  compareAtPrice: string;
  images: string[];
  videoUrl: string | null;
  categoryId: string;
  weight: string;
  purity: string;
  dimensions: string;
  /** One row per size. Empty means the piece has no sizes. */
  sizeStock: Array<{ size: string; stock: string }>;
  material: string;
  stock: string;
  sku: string;
  isFeatured: boolean;
  isBestseller: boolean;
  isActive: boolean;
  tags: string; // comma-separated in the form
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  description: "",
  shortDescription: "",
  price: "",
  compareAtPrice: "",
  images: [],
  videoUrl: null,
  categoryId: "",
  weight: "",
  purity: "925 Sterling Silver",
  dimensions: "",
  sizeStock: [],
  material: "",
  stock: "0",
  sku: "",
  isFeatured: false,
  isBestseller: false,
  isActive: true,
  tags: "",
};

function splitList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export function ProductForm({
  productId,
  initial,
  categories,
}: {
  productId?: string;
  initial: ProductFormValues;
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const isEdit = !!productId;

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.categoryId) {
      toast.error("Choose a category.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        shortDescription: form.shortDescription,
        price: Number(form.price),
        compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
        images: form.images,
        videoUrl: form.videoUrl,
        categoryId: form.categoryId,
        weight: form.weight ? Number(form.weight) : null,
        purity: form.purity,
        dimensions: form.dimensions,
        sizeStock: form.sizeStock
          .filter((r) => r.size.trim().length > 0)
          .map((r) => ({ size: r.size.trim(), stock: Number(r.stock) || 0 })),
        material: form.material,
        stock: Number(form.stock),
        sku: form.sku,
        isFeatured: form.isFeatured,
        isBestseller: form.isBestseller,
        isActive: form.isActive,
        tags: splitList(form.tags),
      };
      const result = isEdit
        ? await updateProductAction(productId!, payload)
        : await createProductAction(payload);
      if (result.ok) {
        toast.success(isEdit ? "Product updated." : "Product created.");
        router.push("/admin/products");
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  function textField(
    key: Extract<keyof ProductFormValues, string>,
    label: string,
    props?: React.ComponentProps<typeof Input>
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={key}>{label}</Label>
        <Input
          id={key}
          value={form[key] as string}
          onChange={(e) => set(key, e.target.value as never)}
          {...props}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      {textField("name", "Name", { required: true })}

      <div className="space-y-1.5">
        <Label htmlFor="shortDescription">Short description</Label>
        <Input
          id="shortDescription"
          value={form.shortDescription}
          onChange={(e) => set("shortDescription", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={5}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Images (up to 6)</Label>
        <ImagesUploader images={form.images} onChange={(images) => set("images", images)} />
      </div>

      <div className="space-y-1.5">
        <Label>Product video (optional)</Label>
        <VideoUploader videoUrl={form.videoUrl} onChange={(url) => set("videoUrl", url)} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {textField("price", "Price (₹)", { type: "number", min: 0, step: "0.01", required: true })}
        {textField("compareAtPrice", "Compare-at price (₹)", { type: "number", min: 0, step: "0.01" })}
        {form.sizeStock.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Stock</Label>
            {/* Derived, not editable: the total is the sum of the size rows, and
                two places to edit one number is how they drift apart. */}
            <div className="flex h-9 items-center rounded-lg border border-input px-2.5 text-sm text-muted-foreground">
              {form.sizeStock.reduce((sum, r) => sum + (Number(r.stock) || 0), 0)} across{" "}
              {form.sizeStock.length} size{form.sizeStock.length === 1 ? "" : "s"}
            </div>
          </div>
        ) : (
          textField("stock", "Stock", { type: "number", min: 0, step: 1, required: true })
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {textField("sku", "SKU", { required: true })}
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {textField("weight", "Weight (grams)", { type: "number", min: 0, step: "0.001" })}
        {textField("purity", "Purity")}
        {textField("dimensions", "Dimensions")}
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Sizes and stock</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Each size holds its own stock. Leave empty for a piece with no sizes —
              earrings and pendants.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setForm((f) => ({ ...f, sizeStock: [...f.sizeStock, { size: "", stock: "0" }] }))
            }
          >
            Add size
          </Button>
        </div>

        {form.sizeStock.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No sizes — sold as one item.</p>
        ) : (
          <div className="space-y-2">
            {form.sizeStock.map((row, i) => (
              // Index as key: rows have no id, and the size is editable, so
              // keying on it would remount the input on every keystroke and
              // lose focus.
              <div key={i} className="flex items-end gap-2">
                <div className="w-40 space-y-1.5">
                  {i === 0 && <Label className="text-xs">Size</Label>}
                  <Input
                    value={row.size}
                    placeholder="7 / 18 in / M"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        sizeStock: f.sizeStock.map((r, j) =>
                          j === i ? { ...r, size: e.target.value } : r,
                        ),
                      }))
                    }
                  />
                </div>
                <div className="w-24 space-y-1.5">
                  {i === 0 && <Label className="text-xs">Stock</Label>}
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={row.stock}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        sizeStock: f.sizeStock.map((r, j) =>
                          j === i ? { ...r, stock: e.target.value } : r,
                        ),
                      }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      sizeStock: f.sizeStock.filter((_, j) => j !== i),
                    }))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {textField("material", "Material")}
      </div>

      {textField("tags", "Tags (comma-separated)")}

      <div className="flex flex-wrap gap-6">
        {(
          [
            ["isFeatured", "Featured"],
            ["isBestseller", "Bestseller"],
            ...(isEdit ? ([["isActive", "Active — visible in store"]] as const) : []),
          ] as Array<[keyof ProductFormValues, string]>
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form[key] as boolean}
              onCheckedChange={(checked) => set(key, checked === true ? true : (false as never))}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create product"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/products")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
