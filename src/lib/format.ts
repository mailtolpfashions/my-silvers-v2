export function formatINR(rupees: number | string): string {
  const n = Number(rupees);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatINRPaise(paise: number): string {
  return formatINR(paise / 100);
}
