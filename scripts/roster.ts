/**
 * The league roster. Names and teams only.
 *
 * There are deliberately NO PINs in this file. The repository is public, so
 * access codes live in db/pins.local.json, which is gitignored. `npm run db:seed`
 * reads that file, generates a strong code for anyone missing one, and prints
 * the list so you can hand them out.
 *
 * `admin: true` grants the commissioner dashboard. `plays: false` marks an
 * account that administers but does not run, and is excluded from league size.
 */
export type RosterEntry = {
  name: string;
  team?: string;
  admin?: boolean;
  plays?: boolean;
};

export const MEMBERS: RosterEntry[] = [
  // Commissioner account. Administers, does not take a draft slot.
  { name: 'Commissioner', team: 'League Office', admin: true, plays: false },

  { name: 'Dan' },
  { name: 'Nikita' },
  { name: 'Chris' },
  { name: 'Travis' },
  { name: 'Mark' },
  { name: 'Ben' },
  { name: 'Chad' },
  { name: 'Colby' },
  { name: 'Jamaris' },
  { name: 'Kevin' },
  { name: 'Ryan' },
  { name: 'Nicholas' },
];

/** Everyone who takes a draft slot. This is what league_size counts. */
export function players(): RosterEntry[] {
  return MEMBERS.filter((m) => m.plays !== false);
}
