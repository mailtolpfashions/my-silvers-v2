import { NewsletterForm } from "@/components/storefront/newsletter-form";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t py-10">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2">
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">MY Silvers</p>
          <p className="mt-1">Sterling silver jewellery, crafted for everyday wear.</p>
          <p className="mt-4">© {new Date().getFullYear()} MY Silvers. All rights reserved.</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Get updates on new arrivals and offers</p>
          <NewsletterForm />
        </div>
      </div>
    </footer>
  );
}
