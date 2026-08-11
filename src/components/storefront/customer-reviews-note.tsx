import { RevealSection } from "@/components/storefront/reveal-section";
/**
 * Stands in for the customer-reviews section in the CMS preview.
 *
 * The real section is an async server component reading live review data, which
 * a client preview pane can't render — and there is nothing to preview anyway:
 * the content comes from customers, not from the entry being edited. This just
 * keeps the section's position on the page visible and explains why.
 */
export function CustomerReviewsPreviewNote() {
  return (
    <RevealSection className="container-page border-t rhythm-commerce text-center">
      <p className="label-eyebrow mb-2">In their words</p>
      <h2 className="text-h2">What our customers say</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Real 4- and 5-star product reviews render here on the live page. Nothing
        to edit — this section fills itself from what customers write.
      </p>
    </RevealSection>
  );
}
