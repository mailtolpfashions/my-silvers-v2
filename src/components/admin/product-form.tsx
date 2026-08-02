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
  sizes: string; // comma-separated in the form
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
  sizes: "",
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
        sizes: splitList(form.sizes),
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
        {textField("stock", "Stock", { type: "number", min: 0, step: 1, required: true })}
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

      <div className="grid grid-cols-2 gap-4">
        {textField("sizes", "Sizes (comma-separated)")}
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
