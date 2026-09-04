/**
 * Milestone banners are the only in-run feedback. They reveal that a threshold
 * was crossed, never the exact yardage.
 */

const FIXED = [100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000, 10000];

/** Past the fixed list, keep going every 5,000 yards. */
export function nextMilestoneAfter(yards: number): number {
  for (const m of FIXED) {
    if (m > yards) return m;
  }
  return Math.floor(yards / 5000) * 5000 + 5000;
}

export function formatMilestone(yards: number): string {
  return `${yards.toLocaleString('en-US')} YARDS`;
}
