"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Star, Trash2, Undo2, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  bulkSetReviewStatusAction,
  deleteReviewAction,
  setReviewStatusAction,
} from "@/actions/admin-review-actions";
import type { ReviewStatus } from "@/generated/prisma/enums";

export type AdminReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  createdAt: string;
  customerName: string;
  productName: string;
  productSlug: string;
  productImage: string | null;
  /** What the customer attached. Moderated with the review, not separately. */
  imageUrls: string[];
  videoUrl: string | null;
};

/**
 * The moderation table — now the gate every review passes through, rather than
 * the after-the-fact tool it was.
 *
 * ── Deleting asks; approving and rejecting do not ────────────────────────────
 * Both state changes are reversible and are the right first move for anything
 * doubtful, so each is one click. Deleting is not reversible AND has a side
 * effect that is easy to miss — the unique constraint on (userId, productId)
 * means removing a review lets that customer write another one, which then
 * arrives back in this queue. The confirmation says so, rather than just asking
 * "are you sure".
 */
/** Past tense, for the toast: "3 reviews approved." */
const STATUS_VERB: Record<ReviewStatus, string> = {
  pending: "returned to the queue",
  approved: "approved",
  rejected: "rejected",
};

export function ReviewTable({ reviews }: { reviews: AdminReview[] }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  /**
   * Selected ids. This used to be for sweeping up a run of spam; with approval
   * turned on it carries the ordinary case — reading down a page of pending
   * reviews and approving the lot.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = reviews.length > 0 && selected.size === reviews.length;

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulk(status: ReviewStatus) {
    const ids = [...selected];
    startTransition(async () => {
      const result = await bulkSetReviewStatusAction(ids, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSelected(new Set());
      toast.success(
        `${ids.length} review${ids.length === 1 ? "" : "s"} ${STATUS_VERB[status]}.`,
      );
    });
  }

  function setStatus(review: AdminReview, status: ReviewStatus) {
    startTransition(async () => {
      const result = await setReviewStatusAction(review.id, status);
      if (!result.ok) toast.error(result.error);
      else toast.success(`Review ${STATUS_VERB[status]}.`);
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
      {/* Select-all and the bulk bar share a row, and the bar only appears once
          something is selected — an always-present toolbar of disabled buttons
          is noise on the 95% of visits that moderate nothing. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) =>
              setSelected(e.target.checked ? new Set(reviews.map((r) => r.id)) : new Set())
            }
            aria-label="Select every review on this page"
            className="size-4"
          />
          Select all on this page
        </label>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">{selected.size} selected</span>
            {/* Approve leads — it is the one that gets used on nearly every
                visit, and putting the destructive-sounding option first would
                make emptying the queue feel like an act of moderation rather
                than the routine it is. */}
            <Button size="sm" disabled={isPending} onClick={() => bulk("approved")}>
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => bulk("rejected")}
            >
              Reject
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {reviews.map((review) => (
        <Card
          key={review.id}
          // Pending is solid — it is live work and should not look switched off.
          // Only a rejected review is dimmed, because that one really is done.
          className={review.status === "rejected" ? "border-dashed opacity-75" : ""}
        >
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
            <input
              type="checkbox"
              checked={selected.has(review.id)}
              onChange={() => toggleSelected(review.id)}
              aria-label={`Select ${review.customerName}'s review of ${review.productName}`}
              className="mt-1 size-4 shrink-0"
            />

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
                {review.status === "pending" && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-900">
                    Awaiting approval
                  </span>
                )}
                {review.status === "rejected" && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">Rejected</span>
                )}
              </div>

              {review.title && <p className="text-sm font-medium">{review.title}</p>}
              {review.comment && (
                <p className="text-sm text-muted-foreground">{review.comment}</p>
              )}

              {/* Opened in a new tab rather than shown in a lightbox. Moderation
                  is about deciding whether something belongs on the shop, and
                  that decision needs the full-size file — a 64px thumbnail is
                  enough to notice a problem, never enough to judge one. */}
              {(review.imageUrls.length > 0 || review.videoUrl) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {review.imageUrls.map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open full size"
                      className="relative size-14 overflow-hidden rounded border"
                    >
                      <Image
                        src={url}
                        alt={`Customer photo ${i + 1}`}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </a>
                  ))}
                  {review.videoUrl && (
                    <a
                      href={review.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Open the customer's video"
                      className="flex size-14 flex-col items-center justify-center gap-0.5 rounded border bg-muted text-[10px] text-muted-foreground"
                    >
                      <Video className="size-4" />
                      Video
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-start gap-1">
              {/* A pending review gets both verbs, because it needs a decision.
                  One that has been decided gets a single button back to the
                  queue instead — re-deciding is one step, not two. */}
              {review.status === "pending" ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Approve this review"
                    title="Publish to the storefront"
                    disabled={isPending}
                    onClick={() => setStatus(review, "approved")}
                    className="size-9 text-emerald-700"
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Reject this review"
                    title="Keep it off the storefront"
                    disabled={isPending}
                    onClick={() => setStatus(review, "rejected")}
                    className="size-9"
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Return this review to the pending queue"
                  title="Undo — send back for another look"
                  disabled={isPending}
                  onClick={() => setStatus(review, "pending")}
                  className="size-9"
                >
                  <Undo2 className="size-4" />
                </Button>
              )}
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

          <ConfirmDialog
            open={confirming === review.id}
            onOpenChange={(next) => setConfirming(next ? review.id : null)}
            title="Delete this review permanently?"
            confirmLabel="Delete permanently"
            disabled={isPending}
            onConfirm={() => remove(review.id)}
            description={
              <>
                {review.customerName} will be able to write a new one for {review.productName} —
                each customer may have one review per product, so removing theirs frees the slot,
                and the replacement lands back in this queue.{" "}
                {(review.imageUrls.length > 0 || review.videoUrl) &&
                  "Their uploaded photos and video are erased from Cloudinary too, so the file URLs stop working. "}
                <strong>Reject it instead</strong> if you only want it off the storefront — that is
                final and does not free the slot.
              </>
            }
          />
        </Card>
      ))}
    </div>
  );
}
