/**
 * Scoreboard rules shared by the browser and the API. Kept free of any
 * database import so the client bundle never pulls in `pg`.
 */

export const BOARD_SIZE = 20;

/** Letters, digits, spaces and periods — the whole alphabet of the board. */
export const INITIALS_PATTERN = /^[A-Z0-9 .]{1,3}$/;

/**
 * Three characters, uppercased, padded with spaces. Returns null for anything
 * outside the allowed set, so the database check never has to fire.
 */
export function cleanInitials(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase();
  if (!INITIALS_PATTERN.test(upper)) return null;
  const padded = upper.padEnd(3, ' ');
  // All-blank initials would render as an empty row on the board.
  return padded.trim() === '' ? null : padded;
}
