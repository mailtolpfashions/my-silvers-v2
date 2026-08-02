"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImagesUploader } from "@/components/admin/media-uploader";
import {
  saveCategoryAction,
  setCategoryActiveAction,
} from "@/actions/admin-category-actions";

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
};

function CategoryFormDialog({
  category,
  trigger,
}: {
  category: CategoryRow | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: category?.name ?? "",
    description: category?.description ?? "",
    image: category?.image ?? null,
    sortOrder: String(category?.sortOrder ?? 0),
    isActive: category?.isActive ?? true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await saveCategoryAction(category?.id ?? null, {
        name: form.name,
        description: form.description,
        image: form.image ?? "",
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      });
      if (result.ok) {
        toast.success(category ? "Category updated." : "Category created.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea
              id="cat-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Image</Label>
            <ImagesUploader
              images={form.image ? [form.image] : []}
              onChange={(images) => setForm((f) => ({ ...f, image: images[0] ?? null }))}
              max={1}
              folder="mysilvers/categories"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-sort">Sort order</Label>
              <Input
                id="cat-sort"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save category"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const [isPending, startTransition] = useTransition();

  function toggleActive(category: CategoryRow) {
    startTransition(async () => {
      const result = await setCategoryActiveAction(category.id, !category.isActive);
      if (result.ok) {
        toast.success(category.isActive ? "Category archived." : "Category restored.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CategoryFormDialog category={null} trigger={<Button size="sm">New category</Button>} />
      </div>

      <div className="space-y-3">
        {categories.map((category) => (
          <div key={category.id} className="flex items-center gap-4 rounded-lg border p-4">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
              {category.image && (
                <Image src={category.image} alt="" fill className="object-cover" sizes="48px" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{category.name}</p>
                <Badge variant={category.isActive ? "secondary" : "destructive"}>
                  {category.isActive ? "Active" : "Archived"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                /{category.slug} · {category.productCount} products · sort {category.sortOrder}
              </p>
            </div>
            <div className="flex gap-2">
              <CategoryFormDialog
                category={category}
                trigger={
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                }
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => toggleActive(category)}
              >
                {category.isActive ? "Archive" : "Restore"}
              </Button>
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No categories yet.</p>
        )}
      </div>
    </div>
  );
}
