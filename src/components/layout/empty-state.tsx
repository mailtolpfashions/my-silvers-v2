/**
 * What a list shows when it has nothing in it.
 *
 * Every table in this admin rendered an empty `<tbody>` in that case — column
 * headers over a blank strip, which reads as broken rather than as empty, and
 * says nothing about whether there is no data at all or the filters simply
 * matched nothing.
 *
 * That distinction is the reason `action` exists. "No products yet" wants an
 * Add product button; "no products match these filters" wants a way to clear
 * them. The caller knows which case it is in; this component does not try to
 * guess.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
