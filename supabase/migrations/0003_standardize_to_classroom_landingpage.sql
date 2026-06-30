-- ============================================================================
-- 0003 — standardize classroom_lp -> classroom_landingpage
-- Pattern: schema-per-app isolation (shares one Supabase project with excel_to_ai).
--
-- Renames the live schema (preserving classroom_leads + all rows), then adds the
-- dedicated role + grants + RLS the standard template prescribes. The rich
-- classroom_leads table from 0001/0002 is kept as-is (NOT the template's toy
-- `leads` table).
--
-- Idempotent: safe to re-run. Run as the postgres superuser in the Supabase SQL editor.
-- Replace <LP_PASSWORD> with the password in CLASSROOM_LANDINGPAGE_DB_URL
--   (CLASSROOM_LANDINGPAGE_DB_PASSWORD in .env.local).
-- AFTER running: Supabase -> Settings -> API -> Exposed schemas -> replace
--   `classroom_lp` with `classroom_landingpage`, then update env + redeploy.
-- ============================================================================

-- 1) Rename the live schema (keeps classroom_leads + every row). Guarded so it
--    runs exactly once; a re-run (schema already renamed) is a no-op.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'classroom_lp')
     and not exists (select 1 from pg_namespace where nspname = 'classroom_landingpage') then
    execute 'alter schema classroom_lp rename to classroom_landingpage';
  end if;
end$$;

-- Fresh-setup fallback (neither schema existed yet).
create schema if not exists classroom_landingpage;

-- 2) Dedicated login role for this app's direct-Postgres (pg Pool) access.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lp_classroom_landingpage') then
    create role lp_classroom_landingpage login password '<LP_PASSWORD>' noinherit;
  end if;
end$$;
grant lp_classroom_landingpage to postgres;

alter role lp_classroom_landingpage set statement_timeout = '5s';
alter role lp_classroom_landingpage set idle_in_transaction_session_timeout = '30s';
alter role lp_classroom_landingpage set search_path = classroom_landingpage;
alter role lp_classroom_landingpage connection limit 20;

grant usage, create on schema classroom_landingpage to lp_classroom_landingpage;
alter default privileges in schema classroom_landingpage grant all on tables    to lp_classroom_landingpage;
alter default privileges in schema classroom_landingpage grant all on sequences to lp_classroom_landingpage;
alter default privileges in schema classroom_landingpage grant execute on functions to lp_classroom_landingpage;

-- 3) Defense in depth: this app's role can never reach other schemas.
revoke all on schema public  from lp_classroom_landingpage;
revoke all on schema auth     from lp_classroom_landingpage;
revoke all on schema storage  from lp_classroom_landingpage;
revoke all privileges on all tables in schema public  from lp_classroom_landingpage;
revoke all privileges on all tables in schema auth     from lp_classroom_landingpage;
revoke all privileges on all tables in schema storage  from lp_classroom_landingpage;

-- 4) Hand the existing (renamed-in) objects to the dedicated role. Default
--    privileges only cover FUTURE objects, so grant on what's already here too.
grant all on all tables    in schema classroom_landingpage to lp_classroom_landingpage;
grant all on all sequences in schema classroom_landingpage to lp_classroom_landingpage;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'classroom_landingpage' and table_name = 'classroom_leads'
  ) then
    execute 'alter table classroom_landingpage.classroom_leads owner to lp_classroom_landingpage';
    execute 'alter table classroom_landingpage.classroom_leads enable row level security';
  end if;
end$$;

-- 5) PostgREST API roles. The supabase-js clients (publishable / secret key)
--    reach this schema via PostgREST, NOT via lp_classroom_landingpage, so the
--    API roles need their own access. RLS still governs anon/authenticated;
--    the secret key (service_role) bypasses RLS. Idempotent + survives the rename.
grant usage on schema classroom_landingpage to anon, authenticated, service_role;
grant all on all tables    in schema classroom_landingpage to service_role;
grant all on all sequences in schema classroom_landingpage to service_role;
alter default privileges in schema classroom_landingpage grant all on tables    to service_role;
alter default privileges in schema classroom_landingpage grant all on sequences to service_role;

-- 6) (From the template) FAQ content table — currently unused by the app; drop
--    it if you don't need it. anon may READ (RLS policy); no write policy exists.
create table if not exists classroom_landingpage.faqs (
  id text primary key,
  question text not null,
  answer text not null,
  sort_order integer not null default 0
);
alter table classroom_landingpage.faqs owner to lp_classroom_landingpage;
alter table classroom_landingpage.faqs enable row level security;
grant select on classroom_landingpage.faqs to anon, authenticated;

drop policy if exists "anon read faqs" on classroom_landingpage.faqs;
create policy "anon read faqs" on classroom_landingpage.faqs for select to anon using (true);
