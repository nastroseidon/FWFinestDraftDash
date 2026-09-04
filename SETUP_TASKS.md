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

That prints the manager list and their access codes. These are the real ones,
read from `db/pins.local.json`. See Task 2.

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
| Sign in as any manager, using the code from the seed output | Reaches the main menu |
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

# Task 2: Roster and access codes

**The roster is already in.** All twelve managers are configured and access
codes are generated. What is left is getting those codes into production and
handing them out.

Dan, Nikita, Chris, Travis, Mark, Ben, Chad, Colby, Jamaris, Kevin, Ryan,
Nicholas. League size 12. Nicholas is also the commissioner.

## 2.1 How codes are kept out of the public repository

This repository is public, so access codes are never written into it.

* `scripts/roster.ts` holds names and teams only. Committed.
* `db/pins.local.json` holds the codes. Gitignored, permissions `600`.

`npm run db:seed` reads that file, generates a strong code for anyone who does
not have one, and prints the full list. Codes already in the file are kept, so
re-seeding never locks anyone out. That is verified.

Codes are **six digits**. The PIN field opens a numeric keypad on a phone, so
letters would be untypeable for anyone on mobile. They never start with a zero,
which avoids "is it 48270 or 048270?" when somebody reads their code aloud.

That is a million combinations with no login rate limiting, which is a
deliberate trade the league made in favour of a code people can enter
one-handed.

## 2.2 Back up db/pins.local.json

Copy it somewhere safe now, outside the repository folder.

If you lose it, the next seed generates fresh codes and overwrites the stored
hashes, which locks every manager out until you send new codes. Nothing else in
the app depends on it.

## 2.3 Push the codes to production

Run this from the same Mac, so production gets the same codes that are in your
local file:

```bash
cd ~/Documents/FWFinestDraftDash
DATABASE_URL="paste-the-connection-string-here" npm run db:seed
```

It prints the table again. Production and local now match.

## 2.4 Remove any placeholder accounts

Only needed if you seeded production before the real roster landed. `db:prune`
shows what it would remove and does nothing until you add `--yes`:

```bash
DATABASE_URL="paste-the-connection-string-here" npm run db:prune
DATABASE_URL="paste-the-connection-string-here" npm run db:prune -- --yes
```

It refuses to delete anyone holding an official score or a draft slot, even with
`--yes`. That guard is tested, so an accidental prune on 7 September cannot
erase somebody's run.

## 2.5 Hand out the codes

Each manager needs their own name and code, sent privately. Not in the group
chat. Signing in is once per device; the session persists after that.

The message is short:

> Draft Dash: <url>
> Manager: <their name>
> Code: <their code from the seed output>
> One official run on Sunday. Practice as much as you like.

## 2.6 Team names

Not being used. Managers are identified by first name throughout, which is what
the league wanted.

Nothing needs doing. The team field stays empty, and the main menu and final
draft order simply show the name on its own.

If that changes later, add a team in `scripts/roster.ts` and re-seed. Codes and
scores are untouched:

```ts
{ name: 'Dan', team: 'Fort Wayne Fury' },
```

## 2.7 The commissioner account

`Nicholas` is the commissioner and also runs. One login does both: the
commissioner dashboard when Phase 5 lands, and a normal official run like
everyone else.

Being admin grants no gameplay advantage. Nicholas gets the same single attempt,
the same locked score and the same refusal on a restart. There are tests for
exactly that, so it cannot quietly change later.

League size is 12, counting Nicholas.

There is no separate Commissioner login any more. If you ever want one, add an
entry with `admin: true, plays: false` and it administers without taking a draft
slot.

---

# How sign in behaves

Managers sign in **once per device** and stay signed in. Nobody needs their code
again on the 7th.

The session is a signed cookie with a 30 day lifetime. Verified behaviour:

| Situation | Still signed in? |
|---|---|
| Reload the page | Yes |
| Close the browser and come back later | Yes, it is a persistent cookie, not a session one |
| You redeploy to Vercel | Yes, there is no server side session store |
| Restart the phone | Yes |
| Days pass between practice and the official run | Yes, up to 30 days |
| They tap SIGN OUT | No, by design |
| Private browsing, or clearing site data | No |
| A different phone or browser | No, they sign in there once |

They can also start their official run straight from a session created days
earlier, with no credentials sent again. That was tested end to end.

## The one thing that would sign everybody out

**Changing `SESSION_SECRET` after managers have signed in.** Sessions are signed
with it, so a new value invalidates every existing one and all twelve would have
to dig out their codes again, possibly on the morning of the draft.

Set it once in step 1.3 and leave it alone. It is only worth rotating if it
leaks, in which case signing everyone out is the point.

Nothing is lost either way: scores live in the database, so a signed out manager
just signs back in and finds their run exactly as it was.

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
  Worth confirming on that dry run that a manager signed in one day is still
  signed in the next. The cookie is set by the server rather than by script, so
  it is not subject to Safari's seven day cap on script written storage, but a
  real device is the honest check.
