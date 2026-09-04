import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Access codes are kept out of the repository, which is public. They live in
 * db/pins.local.json and are gitignored. Losing that file is not fatal: re-run
 * the seed and everyone gets a new code.
 */
const PINS_FILE = join(process.cwd(), 'db', 'pins.local.json');

// No i, l, o, 0 or 1, so a code read off a screen is never ambiguous.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const LENGTH = 8;

export function generatePin(): string {
  let out = '';
  for (let i = 0; i < LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function loadPins(): Record<string, string> {
  if (!existsSync(PINS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(PINS_FILE, 'utf8')) as Record<string, string>;
  } catch {
    throw new Error(`${PINS_FILE} is not valid JSON. Fix or delete it.`);
  }
}

export function savePins(pins: Record<string, string>) {
  mkdirSync(dirname(PINS_FILE), { recursive: true });
  writeFileSync(PINS_FILE, `${JSON.stringify(pins, null, 2)}\n`, { mode: 0o600 });
}

export const PINS_PATH = PINS_FILE;
