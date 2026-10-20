"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * The red asterisk on a field that must be filled.
 *
 * aria-hidden because it is for sighted users only: the input it labels
 * carries `required` (or the form checks it before submitting), and a screen
 * reader already announces "required" from that — reading "star" as well
 * would say it twice. Exported for the few labels that are not <Label>.
 */
function RequiredMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("text-destructive", className)}>
      *
    </span>
  )
}

function Label({
  className,
  required = false,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & {
  /**
   * Marks the field as mandatory with a red asterisk. Purely visual — keep
   * `required` on the input itself (or the form's own check), which is what
   * actually enforces it and what assistive technology reads.
   */
  required?: boolean
}) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {/* -ml-1 pulls it in from the label's gap-2, so it sits beside the
          word rather than floating a full gap away. */}
      {required && <RequiredMark className="-ml-1" />}
    </LabelPrimitive.Root>
  )
}

export { Label, RequiredMark }
