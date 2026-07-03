"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut, RefreshCw, Search, ChevronDown } from "lucide-react";
import Logo from "@/components/Logo";

type Turn = { role: string; content: string };
type Lead = {
  id: string;
  created_at: string;
  full_name: string;
  phone: string;
  email: string | null;
  course: string | null;
  city: string | null;
  background: string | null;
  status: string | null;
  lead_score: "hot" | "warm" | "cold" | "junk" | null;
  lead_reason: string | null;
  qualified_at: string | null;
  chat_conversation: Turn[] | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrer: string | null;
  updated_at: string | null;
  seat_locked: boolean | null;
};

type Channel = "Google" | "Meta" | "Direct" | "Other";
const CHANNELS: Channel[] = ["Google", "Meta", "Direct", "Other"];

/** Best-effort channel attribution from click ids + utm_source. */
function channelOf(l: Lead): Channel {
  const s = (l.utm_source ?? "").toLowerCase();
  if (l.gclid || /google|adwords|gads/.test(s)) return "Google";
  if (l.fbclid || /meta|facebook|fb|instagram|\big\b/.test(s)) return "Meta";
  if (s) return "Other";
  return "Direct";
}

const SCORE_STYLES: Record<string, string> = {
  hot: "bg-green-100 text-green-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-blue-100 text-blue-700",
  junk: "bg-slate-200 text-slate-600",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "cold", label: "Cold" },
  { key: "junk", label: "Junk" },
  { key: "unscored", label: "New" },
] as const;

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ScoreBadge({ score }: { score: Lead["lead_score"] }) {
  const cls = score ? SCORE_STYLES[score] : "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${cls}`}>
      {score ?? "new"}
    </span>
  );
}

function toCsv(rows: Lead[]): string {
  const cols = [
    "created_at", "updated_at", "full_name", "phone", "email", "course", "city", "background",
    "status", "seat_locked", "lead_score", "lead_reason", "qualified_at",
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "referrer",
  ] as const;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/leads", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const json = await res.json();
      setConfigured(json.configured !== false);
      setLeads(json.leads ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const stats = useMemo(() => {
    const s = { total: leads.length, hot: 0, warm: 0, cold: 0, junk: 0, unscored: 0 };
    for (const l of leads) {
      if (l.lead_score) s[l.lead_score]++;
      else s.unscored++;
    }
    return s;
  }, [leads]);

  const funnel = useMemo(() => {
    const qualified = leads.filter((l) => l.qualified_at || l.lead_score).length;
    const hotWarm = leads.filter((l) => l.lead_score === "hot" || l.lead_score === "warm").length;
    const locked = leads.filter((l) => l.seat_locked).length;
    return [
      { label: "Submitted", value: leads.length },
      { label: "Qualified", value: qualified },
      { label: "Hot / Warm", value: hotWarm },
      { label: "Seat locked", value: locked },
    ];
  }, [leads]);

  const channels = useMemo(() => {
    const m = new Map<Channel, { count: number; quality: number }>();
    for (const c of CHANNELS) m.set(c, { count: 0, quality: 0 });
    for (const l of leads) {
      const e = m.get(channelOf(l))!;
      e.count++;
      if (l.lead_score === "hot" || l.lead_score === "warm") e.quality++;
    }
    return CHANNELS.map((c) => ({ channel: c, ...m.get(c)! })).filter((r) => r.count > 0);
  }, [leads]);

  const timeseries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) {
      const k = new Date(l.created_at).toLocaleDateString("en-CA");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const out: { label: string; count: number }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      out.push({
        label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        count: counts.get(d.toLocaleDateString("en-CA")) ?? 0,
      });
    }
    return out;
  }, [leads]);

  // Same-phone rows (after dedup there should be none; flags any that slip in).
  const phoneCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.phone, (m.get(l.phone) ?? 0) + 1);
    return m;
  }, [leads]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter === "unscored" && l.lead_score) return false;
      if (filter !== "all" && filter !== "unscored" && l.lead_score !== filter) return false;
      if (!text) return true;
      return (
        l.full_name?.toLowerCase().includes(text) ||
        l.phone?.toLowerCase().includes(text) ||
        (l.email ?? "").toLowerCase().includes(text)
      );
    });
  }, [leads, filter, q]);

  function exportCsv() {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classroom-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="rounded-full bg-navy/5 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-navy">
            Leads
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-navy hover:bg-brand-400 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-muted hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </div>

      {!configured && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase isn&apos;t configured, so there are no stored leads to show. Set
          <code className="mx-1 rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and
          <code className="mx-1 rounded bg-amber-100 px-1">SUPABASE_SECRET_KEY</code> in your env.
        </div>
      )}

      {/* Stats */}
      <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {([
          ["Total", stats.total, "text-navy"],
          ["Hot", stats.hot, "text-green-600"],
          ["Warm", stats.warm, "text-amber-600"],
          ["Cold", stats.cold, "text-blue-600"],
          ["Junk", stats.junk, "text-slate-500"],
          ["New", stats.unscored, "text-navy"],
        ] as const).map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-white p-3 text-center shadow-sm">
            <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
            <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {leads.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Conversion funnel">
            <FunnelChart steps={funnel} />
          </ChartCard>
          <ChartCard title="Leads by channel">
            <ChannelChart rows={channels} />
          </ChartCard>
          <ChartCard title="Leads over time · 14 days">
            <TrendChart days={timeseries} />
          </ChartCard>
        </div>
      )}

      {/* Filter + search */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                filter === f.key ? "bg-navy text-white" : "border border-slate-200 bg-white text-navy hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / phone / email"
            className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Course / City</th>
              <th className="px-4 py-3 font-semibold">Score</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No leads found.</td></tr>
            ) : (
              filtered.map((l) => {
                const isOpen = expanded === l.id;
                const isDup = (phoneCounts.get(l.phone) ?? 0) > 1;
                const hasDetail =
                  (l.chat_conversation?.length ?? 0) > 0 ||
                  l.lead_reason ||
                  l.utm_source ||
                  l.gclid ||
                  l.fbclid ||
                  l.referrer;
                return (
                  <Fragment key={l.id}>
                    <tr className="align-top hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{fmtDate(l.created_at)}</td>
                      <td className="px-4 py-3 font-semibold text-navy">
                        <span className="flex items-center gap-2">
                          {l.full_name}
                          {isDup && (
                            <span
                              className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700"
                              title="Another lead shares this phone number"
                            >
                              dup
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        <div>{l.phone}</div>
                        {l.email && <div className="text-xs text-slate-400">{l.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        <div>{l.course ?? "—"}</div>
                        <div className="text-xs text-slate-400">{l.city ?? ""}</div>
                      </td>
                      <td className="px-4 py-3"><ScoreBadge score={l.lead_score} /></td>
                      <td className="px-4 py-3 text-xs font-medium uppercase text-muted">{l.status ?? "new"}</td>
                      <td className="px-4 py-3 text-right">
                        {hasDetail && (
                          <button
                            onClick={() => setExpanded(isOpen ? null : l.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                          >
                            Details <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                                Qualification chat
                              </div>
                              {l.lead_reason && (
                                <p className="mb-2 rounded-lg bg-white p-2 text-xs italic text-navy">
                                  AI: {l.lead_reason}
                                </p>
                              )}
                              {l.chat_conversation?.length ? (
                                <div className="space-y-1.5">
                                  {l.chat_conversation.map((t, i) => (
                                    <div key={i} className="text-xs">
                                      <span className={t.role === "user" ? "font-bold text-navy" : "font-semibold text-brand-700"}>
                                        {t.role === "user" ? "A" : "Q"}:
                                      </span>{" "}
                                      <span className="text-muted">{t.content}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400">No chat transcript.</p>
                              )}
                            </div>
                            <div>
                              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                                Attribution
                              </div>
                              <dl className="space-y-1 text-xs text-muted">
                                {l.background && <Row k="I am a" v={l.background} />}
                                <Row k="channel" v={channelOf(l)} />
                                <Row k="seat locked" v={l.seat_locked ? "Yes" : "No"} />
                                <Row k="utm_source" v={l.utm_source} />
                                <Row k="utm_medium" v={l.utm_medium} />
                                <Row k="utm_campaign" v={l.utm_campaign} />
                                <Row k="utm_term" v={l.utm_term} />
                                <Row k="utm_content" v={l.utm_content} />
                                <Row k="gclid" v={l.gclid} />
                                <Row k="fbclid" v={l.fbclid} />
                                <Row k="referrer" v={l.referrer} />
                                {l.qualified_at && <Row k="qualified" v={fmtDate(l.qualified_at)} />}
                                {l.updated_at && <Row k="updated" v={fmtDate(l.updated_at)} />}
                              </dl>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-center text-xs text-slate-400">
        Showing {filtered.length} of {leads.length} leads (latest 2,000).
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 font-mono text-slate-400">{k}</dt>
      <dd className="break-all text-navy">{v || "—"}</dd>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{title}</div>
      {children}
    </div>
  );
}

/** Funnel: single measure across stages → one-hue bars, each labeled with count + % of top. */
function FunnelChart({ steps }: { steps: { label: string; value: number }[] }) {
  const top = steps[0]?.value || 1;
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / top) * 100);
        return (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-semibold text-navy">{s.label}</span>
              <span className="text-muted">
                {s.value}
                {i > 0 && <span className="ml-1 text-slate-400">({pct}%)</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-navy"
                style={{ width: `${s.value > 0 ? Math.max(pct, 4) : 0}%`, opacity: 1 - i * 0.18 }}
                title={`${s.label}: ${s.value}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Leads per acquisition channel → one-hue bars, labeled with count + hot/warm quality. */
function ChannelChart({ rows }: { rows: { channel: string; count: number; quality: number }[] }) {
  if (!rows.length) return <p className="text-xs text-slate-400">No channel data yet.</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.channel}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-navy">{r.channel}</span>
            <span className="text-muted">
              {r.count}
              {r.quality > 0 && <span className="ml-1 text-green-600">· {r.quality} hot/warm</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-600"
              style={{ width: `${Math.max((r.count / max) * 100, 4)}%` }}
              title={`${r.channel}: ${r.count}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Daily lead volume → one-hue vertical bars (hover for the count). */
function TrendChart({ days }: { days: { label: string; count: number }[] }) {
  const max = Math.max(...days.map((d) => d.count), 1);
  const total = days.reduce((a, d) => a + d.count, 0);
  return (
    <div>
      <div className="mb-2 text-xs text-muted">
        <span className="font-bold text-navy">{total}</span> in last 14 days
      </div>
      <div className="flex h-24 items-end gap-1">
        {days.map((d, i) => (
          <div
            key={i}
            className="flex flex-1 items-end justify-center self-stretch"
            title={`${d.label}: ${d.count}`}
          >
            <div
              className="w-full rounded-t bg-navy/80"
              style={{ height: `${d.count ? Math.max((d.count / max) * 100, 6) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] text-slate-400">
        <span>{days[0]?.label}</span>
        <span>{days[days.length - 1]?.label}</span>
      </div>
    </div>
  );
}
