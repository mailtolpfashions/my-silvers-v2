import {
  Award,
  BadgeCheck,
  BookOpen,
  Circle,
  CircleDot,
  Crown,
  Flower,
  Gem,
  Gift,
  Heart,
  Leaf,
  Lock,
  Package,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Renders a CMS `icon` field.
 *
 * Editors put one of two things in that field: a kebab-case Lucide name
 * ("shield-check") or an emoji. The trust bar used to render the value as plain
 * text, so the homepage literally displayed the words "shield-check" and
 * "truck" next to the copy.
 *
 * Names are resolved through an explicit allowlist rather than a dynamic lookup
 * — Lucide has well over a thousand icons and importing it dynamically would
 * pull the whole set into the bundle. Anything unrecognised falls through to
 * being rendered as text, which is what makes emoji keep working.
 */
const ICONS: Record<string, LucideIcon> = {
  award: Award,
  "badge-check": BadgeCheck,
  // Added for the header's category nav — jewellery-shaped options an admin can
  // pick per category, plus book-open for the Journal link.
  "book-open": BookOpen,
  circle: Circle,
  "circle-dot": CircleDot,
  crown: Crown,
  flower: Flower,
  gem: Gem,
  gift: Gift,
  heart: Heart,
  leaf: Leaf,
  lock: Lock,
  package: Package,
  "refresh-ccw": RefreshCcw,
  "rotate-ccw": RotateCcw,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  truck: Truck,
  wallet: Wallet,
};

/** The names an editor can type. Surfaced in the CMS field label. */
export const CMS_ICON_NAMES = Object.keys(ICONS);

export function CmsIcon({ name, className }: { name?: string; className?: string }) {
  if (!name) return null;

  const Icon = ICONS[name.trim().toLowerCase()];
  if (Icon) return <Icon className={className ?? "size-4"} aria-hidden />;

  // Not a known name — assume an emoji or short symbol and render it as-is.
  return (
    <span aria-hidden className={className}>
      {name}
    </span>
  );
}
