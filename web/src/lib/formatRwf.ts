/** Integer RWF with thousands separators */
export function formatRwf(amount: number): string {
  const n = Math.round(Number(amount));
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} RWF`;
}
