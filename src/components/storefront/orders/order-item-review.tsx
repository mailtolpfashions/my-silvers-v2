"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitReviewAction } from "@/actions/review-actions";

/**
 * "Write a review" against one item of a delivered order.
 *
 * Lives here rather than on the product page because this is where proof of
 * purchase is — the same pattern Amazon and Flipkart use. A shopper can only
 * reach this control for something they actually received, so the review that
 * results is organic by construction rather than by after-the-fact filtering.
 */
export function OrderItemReview({
  productId,
  productSlug,
  productName,
  existing,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  /** Their current review, when they've already written one. */
  existing?: { rating: number; title: string | null; comment: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hovered, setHovered] = useState(0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (rating < 1) {
      toast.error("Choose a rating first.");
      return;
    }
    startTransition(async () => {
      const result = await submitReviewAction({
        productId,
        productSlug,
        rating,
        title,
        comment,
      });
      if (result.ok) {
        toast.success(existing ? "Review updated." : "Thanks — your review is live.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={existing ? "ghost" : "outline"} size="sm">
          {existing ? "Edit review" : "Write a review"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base">{productName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium">Your rating</p>
            <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`${value} star${value === 1 ? "" : "s"}`}
                  onMouseEnter={() => setHovered(value)}
                  onClick={() => setRating(value)}
                  className="p-0.5"
                >
                  <Star
                    className={`size-6 transition-colors ${
                      value <= (hovered || rating)
                        ? "fill-black text-black"
                        : "text-muted-foreground/40"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="review-title">
              Title <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="review-title"
              value={title}
              maxLength={150}
              placeholder="Sums up your experience"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="review-comment">
              Your review
            </label>
            <Textarea
              id="review-comment"
              value={comment}
              maxLength={1000}
              rows={4}
              placeholder="How does it wear day to day? Did the finish last?"
              onChange={(e) => setComment(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Reviews of 25 characters or more can feature on the homepage.
            </p>
          </div>

          <Button className="w-full" disabled={isPending} onClick={handleSubmit}>
            {existing ? "Update review" : "Post review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
