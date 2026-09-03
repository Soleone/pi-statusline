/**
 * Number formatting for the token readout.
 *
 * pi-git renders the same `$0.42 ⚡19M ↑264k ↓86k` shape in its commit notices,
 * so the two extensions agree by convention. This copy is deliberately
 * independent: a status line should not depend on a git workflow package for a
 * number formatter, and six duplicated lines is cheaper than that coupling.
 * If the shape changes, change it here and in pi-git's src/usage-format.ts.
 */
export function compactTokenCount(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  // Keep one decimal below 10k, where rounding to whole kilo would hide a third
  // of the spend on small requests.
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}
