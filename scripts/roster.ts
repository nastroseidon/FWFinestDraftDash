/**
 * The league roster. This is the one place to edit managers.
 *
 * PINs are never stored as written: `npm run db:seed` hashes them with scrypt
 * before they reach the database. Re-seeding is safe to repeat and leaves
 * existing scores alone.
 *
 * `admin: true` grants the commissioner dashboard and does not count toward
 * league size. Keep exactly one.
 *
 * Use six or more characters and mix in letters. There is no login rate
 * limiting yet, and a four digit PIN is only 10,000 guesses.
 */
export type RosterEntry = {
  name: string;
  team?: string;
  pin: string;
  admin?: boolean;
};

export const MEMBERS: RosterEntry[] = [
  { name: 'Commissioner', team: 'League Office', pin: '4242', admin: true },
  { name: 'Manager 1', pin: '1001' },
  { name: 'Manager 2', pin: '1002' },
  { name: 'Manager 3', pin: '1003' },
  { name: 'Manager 4', pin: '1004' },
  { name: 'Manager 5', pin: '1005' },
  { name: 'Manager 6', pin: '1006' },
  { name: 'Manager 7', pin: '1007' },
  { name: 'Manager 8', pin: '1008' },
  { name: 'Manager 9', pin: '1009' },
  { name: 'Manager 10', pin: '1010' },
  { name: 'Manager 11', pin: '1011' },
  { name: 'Manager 12', pin: '1012' },
];
