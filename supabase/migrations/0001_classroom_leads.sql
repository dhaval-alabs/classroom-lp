-- Classroom (offline batch) lead capture for the paid-ad landing page.
-- Isolated in its own schema within the shared Supabase project (same pattern
-- as excel_to_ai). Run against your Supabase project (SQL editor or db push).
--
-- AFTER running: Supabase Dashboard → Settings → API → "Exposed schemas" → add
-- `classroom_lp` (so the app's secret key can read/write it via PostgREST).

create schema if not exists classroom_lp;

create table if not exists classroom_lp.classroom_leads (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- form fields
  full_name    text not null,
  phone        text not null,
  email        text,
  course       text,                 -- "Data Science & GenAI" | "Data Analytics with AI" | ...
  city         text,                 -- "Gurgaon" | "Noida" | "Bangalore" | "Online"
  background   text,                 -- "Student / Fresher" | "Working Professional"
  message      text,
  consent      boolean not null default false,

  -- ad attribution (captured from the URL on submit)
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  gclid        text,                 -- Google Ads click id
  fbclid       text,                 -- Meta click id

  -- context
  page_url     text,
  referrer     text,
  user_agent   text,
  ip           text,
  status       text not null default 'new'   -- new | qualified | contacted | enrolled | junk
);

create index if not exists classroom_leads_created_at_idx on classroom_lp.classroom_leads (created_at desc);
create index if not exists classroom_leads_phone_idx       on classroom_lp.classroom_leads (phone);
create index if not exists classroom_leads_status_idx      on classroom_lp.classroom_leads (status);

-- RLS on: only the secret/service-role key (used server-side by /api/lead) may
-- write/read. The anon/public key has NO access, so leads can't be read from
-- the browser.
alter table classroom_lp.classroom_leads enable row level security;
