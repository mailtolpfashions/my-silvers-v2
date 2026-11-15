"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addSubscriberAction } from "@/actions/admin-list-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Owner only — add a newsletter subscriber by hand. */
export function AddSubscriber() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="flex max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await addSubscriberAction(email);
          if (!r.ok) return void toast.error(r.error);
          toast.success(`${email} added.`);
          setEmail("");
          router.refresh();
        });
      }}
    >
      <Input
        type="email"
        required
        aria-label="Email to subscribe"
        placeholder="Add an email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" variant="outline" disabled={isPending || !email}>
        Add subscriber
      </Button>
    </form>
  );
}
