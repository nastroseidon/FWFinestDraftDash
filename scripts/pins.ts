import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Access codes are kept out of the repository, which is public. They live in
 * db/pins.local.json and are gitignored. Losing that file is not fatal: re-run
 * the seed and everyone gets a new code.
 */
const PINS_FILE = join(process.cwd(), 'db', 'pins.local.json');

/**
 * Digits only. The PIN field opens a numeric keypad on a phone, so anything
 * else would be untypeable for half the league.
 *
 * Six digits is a million combinations. That is weak against a patient attacker
 * and there is no login rate limiting, which is a deliberate trade the league
 * made in favour of a code people can actually enter one-handed.
 */
const ALPHABET = '0123456789';
const LENGTH = 6;

export function generatePin(): string {
  // Never start with a zero. A leading zero invites "is it 48270 or 048270?"
  // when somebody reads their code off a phone screen.
  let out = ALPHABET[1 + randomInt(ALPHABET.length - 1)];
  for (let i = 1; i < LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
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
