-- Migration 0002: Gemini lead-qualification fields on classroom_leads.
-- Mirrors the masterclass CRM structure: a tier (hot/warm/cold/junk), the
-- reason, when it was scored, and the full chat transcript.

alter table public.classroom_leads
  add column if not exists lead_score text
    constraint classroom_leads_lead_score_check
    check (lead_score in ('hot','warm','cold','junk')),
  add column if not exists lead_reason       text,
  add column if not exists qualified_at      timestamptz,
  add column if not exists chat_conversation jsonb;

-- Filter by tier in the sales dashboard / export.
create index if not exists classroom_leads_lead_score_idx
  on public.classroom_leads (lead_score)
  where lead_score is not null;

-- status lifecycle: 'new' (form submitted) -> 'qualified' (chat done + scored).
