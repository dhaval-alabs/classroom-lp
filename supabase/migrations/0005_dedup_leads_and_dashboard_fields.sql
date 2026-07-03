-- ============================================================================
-- 0005 — dedup leads by phone + dashboard fields
-- 1) Snapshot backup (kept for safety), 2) dedup existing rows keeping the
-- richest per phone, 3) unique index on phone (one lead per phone; enables the
-- app's upsert-by-phone), 4) add updated_at + seat_locked columns.
-- Run ONCE as the postgres role in the Supabase SQL editor. Idempotent-safe.
-- ============================================================================

-- 1) Full snapshot backup before we delete anything. Keep it until you're
--    confident; drop later with: drop table classroom_landingpage.classroom_leads_backup_0005;
create table if not exists classroom_landingpage.classroom_leads_backup_0005 as
  select * from classroom_landingpage.classroom_leads;

-- 2) Keep the richest row per phone (scored > qualified > has course > newest),
--    delete the rest.
with ranked as (
  select id,
    row_number() over (
      partition by phone
      order by (lead_score is not null) desc,
               (qualified_at is not null) desc,
               (course is not null) desc,
               created_at desc
    ) as rn
  from classroom_landingpage.classroom_leads
)
delete from classroom_landingpage.classroom_leads
where id in (select id from ranked where rn > 1);

-- 3) One lead per phone going forward (enables ON CONFLICT / app upsert).
create unique index if not exists classroom_leads_phone_key
  on classroom_landingpage.classroom_leads (phone);

-- 4) New columns: last-touched timestamp + seat-lock (qualification commit) flag.
alter table classroom_landingpage.classroom_leads
  add column if not exists updated_at  timestamptz,
  add column if not exists seat_locked boolean not null default false;
