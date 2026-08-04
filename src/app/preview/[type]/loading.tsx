/**
 * The preview iframe renders whatever the editor posts to it, so there is
 * nothing to prerender — this boundary just declares the route dynamic.
 */
export default function PreviewLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-[100] flex items-center justify-between bg-foreground px-4 py-1.5 text-xs text-background">
        <span className="font-semibold uppercase tracking-wider">Preview</span>
        <span className="opacity-70">Loading…</span>
      </div>
    </div>
  );
}
