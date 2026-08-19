"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deleteReviewAction, setReviewPublishedAction } from "@/actions/admin-review-actions";

export type AdminReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isPublished: boolean;
  isVerifiedPurchase: boolean;
  createdAt: string;
  customerName: string;
  productName: string;
  productSlug: string;
  productImage: string | null;
};

/**
 * The moderation table.
 *
 * ── Deleting asks; hiding does not ───────────────────────────────────────────
 * Hiding is reversible and is the right first move for anything doubtful, so it
 * is one click. Deleting is not reversible AND has a side effect that is easy
 * to miss — the unique constraint on (userId, productId) means removing a
 * review lets that customer write another one. The confirmation says so, rather
 * than just asking "are you sure".
 */
export function ReviewTable({ reviews }: { reviews: AdminReview[] }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  function toggle(review: AdminReview) {
    startTransition(async () => {
      const result = await setReviewPublishedAction(review.id, !review.isPublished);
      if (!result.ok) toast.error(result.error);
      else toast.success(review.isPublished ? "Review hidden." : "Review is visible again.");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteReviewAction(id);
      if (!result.ok) toast.error(result.error);
      else toast.success("Review deleted.");
      setConfirming(null);
    });
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <Card key={review.id} className={review.isPublished ? "" : "border-dashed opacity-75"}>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
            <div className="relative size-16 shrink-0 overflow-hidden bg-muted">
              {review.productImage && (
                <Image
                  src={review.productImage}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={`size-3.5 ${i < review.rating ? "fill-current" : "text-muted-foreground/30"}`}
                    />
                  ))}
                </span>
                <Link
                  href={`/products/${review.productSlug}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {review.productName}
                </Link>
                <span className="text-muted-foreground">{review.customerName}</span>
                <span className="text-muted-foreground">
                  {new Date(review.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {!review.isVerifiedPurchase && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                    Unverified
                  </span>
                )}
                {!review.isPublished && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">Hidden</span>
                )}
              </div>

              {review.title && <p className="text-sm font-medium">{review.title}</p>}
              {review.comment && (
                <p className="text-sm text-muted-foreground">{review.comment}</p>
              )}
            </div>

            <div className="flex shrink-0 items-start gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={review.isPublished ? "Hide this review" : "Show this review"}
                title={review.isPublished ? "Hide from the storefront" : "Show on the storefront"}
                disabled={isPending}
                onClick={() => toggle(review)}
                className="size-9"
              >
                {review.isPublished ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete this review"
                disabled={isPending}
                onClick={() => setConfirming(review.id)}
                className="size-9 text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </CardContent>

          {confirming === review.id && (
            <CardContent className="border-t bg-muted/40 p-4 text-sm">
              <p>
                Delete this review permanently? {review.customerName} will be able to write a new
                one for {review.productName} — each customer may have one review per product, so
                removing theirs frees the slot. <strong>Hide it instead</strong> if you only want it
                off the storefront.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => remove(review.id)}
                >
                  Delete permanently
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
