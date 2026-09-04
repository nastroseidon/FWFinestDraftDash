# Setup Tasks

Two things need your account access before Draft Dash can go live. Neither
blocks further development, which continues against the local database.

Do Task 1 first. Task 2 can happen any time before 7 September.

---

# Task 1: Database and Vercel deployment

Roughly 20 minutes. You need the connection string from step 3 in step 5, so
keep a scratch file open.

## 1.1 Import the repository into Vercel

1. Go to https://vercel.com and sign in.
2. **Add New** then **Project**.
3. Find `nastroseidon/FWFinestDraftDash` and click **Import**. Authorise
   Vercel for the repository if it asks.
4. Vercel detects Next.js on its own. Leave every build setting alone.
5. Click **Deploy**.

The first deploy **will build successfully but the app will not work yet**.
That is expected. Nothing touches the database at build time, so the build
passes; sign in fails at runtime until steps 1.2 and 1.3 are done.

**Check:** the deployment finishes green and you get a URL like
`fwfinestdraftdash.vercel.app`. Opening it shows the DRAFT DASH login screen.
Trying to sign in fails. That is the correct state at this point.

## 1.2 Create the database

1. In the project, open the **Storage** tab.
2. **Create Database**, then choose **Neon** from the marketplace options.
3. Free plan. For region pick the US East option, which is closest to Fort Wayne.
4. Make sure it is connected to the `FWFinestDraftDash` project when prompted.

Vercel writes the connection details into the project's environment variables
for you.

**Check:** open **Settings** then **Environment Variables**. You should see a
`DATABASE_URL` entry.

> If there is no variable named exactly `DATABASE_URL`, look for one holding a
> Postgres connection string under a different name, such as `POSTGRES_URL`.
> Copy its value and add a new variable named `DATABASE_URL` with that same
> value. The app reads `DATABASE_URL` and nothing else.

## 1.3 Add the session secret

The app refuses to start a session without this, on purpose.

1. Generate one. In Terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

2. In Vercel: **Settings**, **Environment Variables**, **Add New**.
3. Name it `SESSION_SECRET`, paste the generated value.
4. Apply it to Production, Preview and Development.
5. Save.

Treat this like a password. Anyone holding it can forge a session as any
manager. If it ever leaks, generate a new one and redeploy; every manager is
simply signed out.

## 1.4 Copy the connection string

You need it locally to create the tables.

1. **Settings**, **Environment Variables**, find `DATABASE_URL`.
2. Reveal and copy the value. It looks like
   `postgresql://user:password@ep-something.us-east-1.aws.neon.tech/dbname?sslmode=require`.

## 1.5 Create the tables and the league

Run these from the project folder on your Mac. Substitute the string you just
copied, keeping the quotes.

```bash
cd ~/Documents/FWFinestDraftDash
DATABASE_URL="paste-the-connection-string-here" npm run db:migrate
```

Expected output:

```
apply 001_init.sql ... ok
```

Then seed the league:

```bash
DATABASE_URL="paste-the-connection-string-here" npm run db:seed
```

That prints the manager list and PINs. **These are placeholders.** Task 2
replaces them.

Passing `DATABASE_URL` on the command line overrides `.env.local`, so this
touches production and leaves your local database untouched. That is verified
behaviour, not an assumption.

## 1.6 Redeploy

Environment variables only reach a running deployment after a rebuild.

1. Open the **Deployments** tab.
2. On the most recent deployment, use the menu and choose **Redeploy**.

## 1.7 Confirm it works

Open the deployment URL on your phone, in portrait.

| Check | Expected |
|---|---|
| Sign in as `Manager 1` PIN `1001` | Reaches the main menu |
| Main menu | Shows a live countdown to 7 September, midnight |
| OFFICIAL RUN button | Greyed out and reads OFFICIAL RUN LOCKED |
| PRACTICE | Plays, and the score sticks after a reload |
| Rotate to landscape | ROTATE YOUR PHONE overlay |

If sign in fails, the cause is almost always step 1.6. Environment variables do
not apply to an already built deployment.

## 1.8 Link it from nicksmith.app

Optional, and it can wait until the game is final. nicksmith.app is GitHub
Pages, served from the `nastroseidon.github.io` repository. Adding Draft Dash
means editing that site's HTML to add a tile pointing at the Vercel URL, the
same way `nihcs-legacylag` is linked today. Tell me when you want it and I will
prepare the change.

---

# Task 2: Replace the placeholder roster

The league is currently seeded with `Manager 1` through `Manager 12` and PINs
`1001` through `1012`, plus a `Commissioner` account with PIN `4242`.

## Read this before choosing PINs

There is no rate limiting on the login endpoint yet. A four digit PIN is 10,000
guesses, which a determined league member could work through in minutes. In this
game the payoff for guessing someone's PIN is burning their one official run,
which is exactly the kind of mischief this league would enjoy.

**Use six or more characters and mix in letters.** Something like `k7dragon` or
`Blitz-91`. They are typed once per device and then the session persists, so
length costs almost nothing.

Tell me if you would rather I add login rate limiting instead. It is a small
change and a good idea regardless.

## 2.1 Choose the option that suits you

**Option A, send me the roster.** Paste the list here in this format and I will
make the change, verify it and commit:

```
Display name | Team name | PIN
Nick Smith   | Team Name | somepin
```

Note that display names are what managers type to sign in, so keep them short
and unambiguous. First names usually work.

**Option B, edit it yourself.** Continue below.

## 2.2 Edit the roster file

Open `scripts/roster.ts`. That file exists only to hold the roster, so it is the
only thing you edit:

```ts
export const MEMBERS: RosterEntry[] = [
  { name: 'Commissioner', team: 'League Office', pin: '4242', admin: true },
  { name: 'Manager 1', pin: '1001' },
  ...
];
```

Replace it with the real league. Rules:

* `name` is the sign in handle. Case does not matter at sign in.
* `team` is optional and shown on the main menu.
* `pin` is never stored as written. It is hashed with scrypt before it touches
  the database.
* `admin: true` grants the commissioner dashboard when Phase 5 lands. Keep
  exactly one, and it does not count toward league size.

Example:

```ts
export const MEMBERS: RosterEntry[] = [
  { name: 'Nick', team: 'League Office', pin: 'choose-something', admin: true },
  { name: 'Dave', team: 'Fort Wayne Fury', pin: 'choose-something' },
  { name: 'Steve', team: 'Summit City Slingers', pin: 'choose-something' },
  { name: 'Ryan', team: 'Three Rivers Rush', pin: 'choose-something' },
];
```

`league_size` is worked out from the number of non admin managers, so you do not
set it anywhere. Verified: swapping in a four player roster moved it from 12 to 4.

The seed checks the roster before touching the database and stops with a plain
message if something is wrong: not exactly one admin, fewer than 4 or more than
16 players, duplicate names, or a blank name or PIN. It also warns about PINs
shorter than six characters.

## 2.3 Apply it

Local database first:

```bash
cd ~/Documents/FWFinestDraftDash
npm run db:seed
```

Then production, using the same connection string from Task 1:

```bash
DATABASE_URL="paste-the-connection-string-here" npm run db:seed
```

Re-seeding is safe to repeat. Managers are matched on display name, and their
scores and practice bests are left alone.

## 2.4 What re-seeding does not do

**It does not remove anyone.** Deleting a manager from the roster leaves their
row in the database. Placeholder accounts left behind could still sign in and
take a draft slot.

Use `db:prune` to clear them. It shows what it would delete and does nothing
until you add `--yes`:

```bash
npm run db:prune
npm run db:prune -- --yes
```

Then the same against production:

```bash
DATABASE_URL="paste-the-connection-string-here" npm run db:prune
DATABASE_URL="paste-the-connection-string-here" npm run db:prune -- --yes
```

It refuses to delete anyone holding an official score or a draft slot, even with
`--yes`. That guard is tested, so an accidental prune on 7 September cannot
erase somebody's run.

**Check:** the dry run lists exactly the placeholders and nothing else.

## 2.5 Distribute the PINs

Send each manager their own name and PIN privately. Not in the group chat.

---

# Before official day

A short list for 7 September. I will handle these unless you want them yourself.

* Phase 4 and 5 finished and deployed, since draft selection opens at 5:00 PM.
* Confirm `official_open_override` is `null` in production so the real schedule
  governs rather than a manual override left over from testing.
* Confirm the schedule in `league_settings` reads 7 September 2026, midnight to
  5:00 PM, then selection to 6:00 PM, in
  `America/Indiana/Indianapolis`.
* A dry run on a real phone, both iPhone and Android if you can manage it.
