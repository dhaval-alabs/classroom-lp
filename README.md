# AnalytixLabs — Offline Classroom Batch Landing Page

A fast, conversion-optimized Next.js landing page for paid (Meta + Google) ad
traffic. Captures leads for in-person Data Science & AI classroom batches into
Supabase, with built-in Meta Pixel / Google Ads / GA4 conversion tracking.

## Stack
- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 3
- Supabase (lead storage via server-side service-role key)
- `lucide-react` icons

## Quick start
```bash
npm install
cp .env.example .env.local   # then fill in values (optional for UI preview)
npm run dev                  # http://localhost:3000
```
With Supabase left blank, the page still runs — submitted leads are logged to
the server console instead of being persisted (handy for UI preview).

## Configure lead storage (Supabase)
1. Create / pick a Supabase project.
2. Run the migrations in `supabase/migrations/` **in order**
   (`0001_classroom_leads.sql`, then `0002_lead_qualification.sql`) — SQL Editor
   → paste → run, or `supabase db push`.
3. In `.env.local` set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (service_role key — **server only**, never exposed)

Leads land in the `classroom_leads` table. RLS is ON and only the service-role
key (used by `/api/lead`) can read/write, so the browser can never read leads.

## Lead qualification chatbot (Gemini)
After a successful registration the form hands off to a **Gemini-powered
qualification chatbot** (mirrors the masterclass LP flow):

1. **Form submit** → `/api/lead` inserts the lead and returns its `id`.
2. **`QualificationChat`** asks 5 quick screening questions (with one-tap
   quick-replies), and `/api/chat/ack` fetches a short, human Gemini
   acknowledgment between questions.
3. On finish, **`/api/qualify`** sends the transcript to Gemini, which returns a
   tier — **hot / warm / cold / junk** — and a one-line reason. Both the score
   and the full transcript are written back onto the lead row
   (`lead_score`, `lead_reason`, `qualified_at`, `chat_conversation`,
   `status = 'qualified'`).

The transcript is always saved even if scoring fails, and the whole step is
non-blocking — if `GEMINI_API_KEY` is unset the chat still runs and simply
skips the AI acks/scoring. Set in `.env.local`:
- `GEMINI_API_KEY` — Google Gemini key (aistudio.google.com/apikey)
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`

Sales can then filter the CRM by `lead_score` to prioritise hot/warm leads.
Qualification logic lives in `src/lib/qualify.ts`.

## Configure conversion tracking (optional)
Set any of these in `.env.local` — blank tags are skipped automatically:
- `NEXT_PUBLIC_META_PIXEL_ID` — fires `PageView` on load + `Lead` on submit.
- `NEXT_PUBLIC_GOOGLE_ADS_ID` + `NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL` — fires the
  Google Ads conversion on submit.
- `NEXT_PUBLIC_GA4_ID` — page views + a `generate_lead` event on submit.

The conversion event fires only on a **confirmed** successful submission
(see `trackLead()` in `src/components/Analytics.tsx`).

## Admin dashboard (`/admin`)
A lightweight, password-protected leads dashboard — no separate DB or auth
provider, just two env vars:
- `ADMIN_PASSWORD` — the login password.
- `ADMIN_SESSION_SECRET` — a long random string that signs the session cookie
  (`openssl rand -hex 32`). Both must be set or `/admin` stays disabled.

Sign in at **`/admin/login`**. The dashboard shows lead-tier stats
(hot/warm/cold/junk/new), filter tabs + search, and per-lead detail (the Gemini
chat transcript, AI reason, and UTM/gclid/fbclid attribution), plus one-click
**CSV export** of the current view. Auth is an HMAC-signed `httpOnly` cookie
(12h); the `/admin` page and `/api/admin/*` routes verify it server-side, and
`/admin` is `noindex`. Leads are read via the service-role key, so the browser
never gets direct DB access.

## Ad attribution
The form auto-captures `utm_source/medium/campaign/term/content`, `gclid` and
`fbclid` from the landing URL plus the page URL & referrer, and stores them on
each lead row — so sales/marketing can tie every lead back to its campaign.

## Editing content
All copy, courses, cities, stats, programs, testimonials and FAQs live in
`src/lib/site.ts`. Brand colors live in `tailwind.config.ts` (`navy` / `brand`).

## Deploy
Deploy to Vercel (recommended) and set the same env vars in the project
settings. `npm run build` must pass first.

## Project map
```
src/
  app/
    layout.tsx          # metadata, fonts, Analytics
    page.tsx            # section assembly
    globals.css         # Tailwind + design tokens
    api/lead/route.ts   # POST handler → Supabase insert (validated)
  components/           # Header, Hero, LeadForm, Sections, Faq, Footer, ...
  lib/
    site.ts             # all editable content
    supabase.ts         # server-only service-role client
supabase/migrations/    # classroom_leads table
```
