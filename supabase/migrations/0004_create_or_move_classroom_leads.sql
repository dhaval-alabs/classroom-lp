-- ============================================================================
-- 0004 — ensure classroom_landingpage.classroom_leads exists
-- The Schema Visualizer showed `classroom_landingpage` with ONLY `faqs`, which
-- means 0001/0002 were never applied to this project (so the rename in 0003 had
-- nothing to bring over). This makes the leads table exist with the full
-- 0001+0002 shape, whether or not a legacy classroom_lp.classroom_leads is still
-- around (it moves the real one over first, preserving any rows).
-- Idempotent: safe to re-run. Run as the postgres role in the Supabase SQL editor.
-- ============================================================================

-- 1) If a legacy table still sits in classroom_lp WITH data, move it over (keeps
--    every row). No-op if it's absent or already in classroom_landingpage.
do $$
begin
  if exists (
        select 1 from information_schema.tables
        where table_schema = 'classroom_lp' and table_name = 'classroom_leads')
     and not exists (
        select 1 from information_schema.tables
        where table_schema = 'classroom_landingpage' and table_name = 'classroom_leads') then
    execute 'alter table classroom_lp.classroom_leads set schema classroom_landingpage';
  end if;
end$$;

-- 2) Fresh case: create the table if neither the move nor a prior run produced it.
create table if not exists classroom_landingpage.classroom_leads (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  -- form fields
  full_name    text not null,
  phone        text not null,
  email        text,
  course       text,
  city         text,
  background   text,
  message      text,
  consent      boolean not null default false,

  -- ad attribution (captured from the URL on submit)
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  gclid        text,
  fbclid       text,

  -- context
  page_url     text,
  referrer     text,
  user_agent   text,
  ip           text,
  status       text not null default 'new'
);

-- 3) Lead-qualification columns (from 0002); add-if-missing covers a moved table
--    that only had 0001 applied.
alter table classroom_landingpage.classroom_leads
  add column if not exists lead_score        text,
  add column if not exists lead_reason       text,
  add column if not exists qualified_at      timestamptz,
  add column if not exists chat_conversation jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'classroom_leads_lead_score_check') then
    alter table classroom_landingpage.classroom_leads
      add constraint classroom_leads_lead_score_check
      check (lead_score in ('hot','warm','cold','junk'));
  end if;
end$$;

-- 4) Indexes.
create index if not exists classroom_leads_created_at_idx on classroom_landingpage.classroom_leads (created_at desc);
create index if not exists classroom_leads_phone_idx      on classroom_landingpage.classroom_leads (phone);
create index if not exists classroom_leads_status_idx     on classroom_landingpage.classroom_leads (status);
create index if not exists classroom_leads_lead_score_idx
  on classroom_landingpage.classroom_leads (lead_score)
  where lead_score is not null;

-- 5) Ownership + RLS + PostgREST access (mirrors 0003 for this table). The secret
--    key (service_role) bypasses RLS; anon has no policy here, so no browser access.
alter table classroom_landingpage.classroom_leads owner to lp_classroom_landingpage;
alter table classroom_landingpage.classroom_leads enable row level security;
grant all on classroom_landingpage.classroom_leads to service_role;
