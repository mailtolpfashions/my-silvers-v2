"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitReviewAction } from "@/actions/review-actions";

export function ReviewForm({
  productId,
  productSlug,
}: {
  productId: string;
  productSlug: string;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Please choose a star rating.");
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
        toast.success("Thanks for your review!");
        setTitle("");
        setComment("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <p className="text-sm font-medium">Write a review</p>

      <div className="space-y-1.5">
        <Label>Rating</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              onMouseEnter={() => setHovered(value)}
              onMouseLeave={() => setHovered(0)}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
            >
              <Star
                className={`h-6 w-6 transition-colors ${
                  value <= (hovered || rating)
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-title">Title (optional)</Label>
        <Input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={150}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-comment">Your review</Label>
        <Textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={1000}
        />
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Submitting…" : "Submit review"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Reviewing again updates your existing review.
      </p>
    </form>
  );
}
