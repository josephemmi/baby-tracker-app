# Baby Tracker

A shared, real-time baby-tracking app (feeds, pees, poops) built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project at [supabase.com](https://supabase.com), then copy `.env.local.example` to `.env.local` and fill in your project's URL and anon key (found under Project Settings → API):

   ```bash
   cp .env.local.example .env.local
   ```

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Apply the database schema: open your Supabase project's SQL Editor and run each file in `supabase/migrations/` **in filename order** (they're timestamped). (If you have the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) linked to this project, `supabase db push` works too.)

4. Optional but recommended for a two-person household: under Authentication → Providers → Email in the Supabase dashboard, turn off "Confirm email" so signup doesn't require clicking an email link first.

5. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Sign up, then on the onboarding screen either create a household (you'll get an invite code to share) or join one with a code, then add your baby.

## Project structure

- `src/app` — Next.js App Router pages (`/login`, `/signup`, `/onboarding`, and `/` for the logging matrix)
- `src/components` — React components, grouped by feature (`auth`, `onboarding`, `baby`, `log`)
- `src/lib/supabase` — Supabase client helpers (browser, server, and middleware clients, using `@supabase/ssr`) and generated `Database` types
- `src/lib/entries.ts` — grouping/formatting helpers shared by the logging UI
- `middleware.ts` — refreshes the Supabase auth session on each request
- `supabase/migrations` — SQL schema migrations, applied in order

## Data model

Four tables, matching the paper log this app replaces:

- `households` — a household using the app, with a unique `invite_code` for onboarding
- `users` — one row per household member, mirrors `auth.users`
- `babies` — one row per baby, belongs to a household
- `entries` — one row per logged event: `type` (`feed` / `pee` / `poop`), `timestamp`, `notes`, `amount_ml` (feed only), `logged_by`

Row Level Security is enabled on all four tables, scoped so a signed-in user can only see/edit their own household's data (via a `current_household_id()` helper function). New users attach to a household through the `create_household`/`join_household` Postgres functions (called from the onboarding screen), not by inserting rows directly.

The matrix UI clusters same-instant entries (e.g. a feed logged alongside a pee) back into a single row for display, since the paper log this replaces often has multiple things happening at once — see `groupEntriesIntoMoments` in `src/lib/entries.ts`.

Realtime is enabled on `entries` (see the `enable_realtime` migration), so when one household member logs something, the other sees it appear live without refreshing — this is delivered subject to the same RLS policies, so only household members receive it.

## Stack

- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS
- **Backend:** Supabase (Postgres, Auth, Realtime)
- **Hosting:** Vercel
