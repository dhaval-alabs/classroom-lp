"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { COURSES, CITIES, BACKGROUNDS } from "@/lib/site";
import { trackLead } from "@/components/Analytics";
import { newEventId, readFbCookies } from "@/lib/metaClient";
import QualificationChat from "@/components/QualificationChat";

type Status = "idle" | "submitting" | "success" | "error";

const TRACKING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
] as const;

type Tracking = Partial<Record<(typeof TRACKING_KEYS)[number], string>> & {
  page_url?: string;
  referrer?: string;
};

export default function LeadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadName, setLeadName] = useState<string>("");
  const tracking = useRef<Tracking>({});

  // Capture ad attribution from the URL once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t: Tracking = {};
    for (const k of TRACKING_KEYS) {
      const v = params.get(k);
      if (v) t[k] = v;
    }
    t.page_url = window.location.href;
    t.referrer = document.referrer || undefined;
    tracking.current = t;
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const data = new FormData(form);

    const phone = String(data.get("phone") || "").replace(/[^\d]/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!data.get("consent")) {
      setError("Please agree to be contacted so our counsellor can call you.");
      return;
    }

    // Shared id for Meta browser↔server dedup, plus Meta's ad cookies so the
    // Conversions API can match the event to a user/click.
    const eventId = newEventId();
    const { fbp, fbc } = readFbCookies();

    const payload = {
      full_name: String(data.get("full_name") || ""),
      phone,
      email: String(data.get("email") || ""),
      course: String(data.get("course") || ""),
      city: String(data.get("city") || ""),
      background: String(data.get("background") || ""),
      consent: true,
      ...tracking.current,
      meta: {
        event_id: eventId,
        event_source_url: tracking.current.page_url,
        fbp: fbp || undefined,
        fbc: fbc || undefined,
      },
    };

    setStatus("submitting");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Something went wrong. Please try again.");
      }
      trackLead(eventId); // browser Meta/Google conversion; eventId dedups vs server CAPI
      setLeadId(json.id ?? null);
      setLeadName(payload.full_name);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_16px_40px_-8px_rgba(0,51,104,0.08)] md:p-6"
        role="status"
        aria-live="polite"
      >
        <div className="mb-4 flex items-center justify-between rounded-lg border border-brand/20 bg-brand/10 px-3 py-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">
            ✓ Registered
          </span>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-700">
            One quick step
          </span>
        </div>
        <h3 className="mb-1 text-xl font-bold tracking-tight text-navy">
          You&apos;re in! Let&apos;s personalise your call
        </h3>
        <QualificationChat leadId={leadId} name={leadName} />
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-slate-100 bg-white p-4 shadow-[0_16px_40px_-8px_rgba(0,51,104,0.08)] md:p-6"
      id="register"
    >
      {/* Urgency pill */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-red-100 bg-gradient-to-r from-red-50 via-orange-50 to-red-50 px-3 py-2">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-600">
            Next classroom batch
          </span>
        </span>
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-600">
          Limited seats
        </span>
      </div>

      <div className="mb-5">
        <h3 className="text-xl font-bold tracking-tight text-navy">Book Your Free Counselling Session</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Join 21,000+ learners who upskilled with AnalytixLabs. Reserve your seat in 30 seconds.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate id="lead-form" className="space-y-4">
        <div>
          <label className="field-label" htmlFor="full_name">
            Full name*
          </label>
          <input
            id="full_name"
            name="full_name"
            className="field"
            placeholder="Your name"
            required
            autoComplete="name"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="phone">
              Mobile number*
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              className="field"
              placeholder="10-digit mobile"
              required
              autoComplete="tel"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="field"
              placeholder="you@email.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="course">
              Course*
            </label>
            <select id="course" name="course" className="field" required defaultValue="">
              <option value="" disabled>
                Select a course
              </option>
              {COURSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="city">
              Location*
            </label>
            <select id="city" name="city" className="field" required defaultValue="">
              <option value="" disabled>
                Select a city
              </option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="background">
            I am a
          </label>
          <select id="background" name="background" className="field" defaultValue="">
            <option value="" disabled>
              Select one
            </option>
            {BACKGROUNDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2.5 text-xs text-muted">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand"
          />
          <span>
            I authorise AnalytixLabs to contact me via call / WhatsApp / email regarding this
            program. I agree to the privacy policy.
          </span>
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={status === "submitting"}>
          {status === "submitting" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Submitting…
            </>
          ) : (
            "Reserve My Seat →"
          )}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] uppercase tracking-widest text-muted">
          <ShieldCheck className="h-3.5 w-3.5" /> Instant callback · No spam
        </p>
      </form>

      {/* Bottom metrics */}
      <div className="mt-6 flex items-center justify-between border-t border-slate-50 pt-5 text-center">
        <div>
          <div className="text-lg font-bold text-navy">
            4.9<span className="ml-0.5 text-gold">★</span>
          </div>
          <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-widest text-slate-400">
            Rating
          </div>
        </div>
        <div className="h-6 w-px bg-slate-100" />
        <div>
          <div className="text-lg font-bold text-navy">21,000+</div>
          <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-widest text-slate-400">
            Alumni
          </div>
        </div>
        <div className="h-6 w-px bg-slate-100" />
        <div>
          <div className="text-lg font-bold text-navy">97%</div>
          <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-widest text-slate-400">
            Placement
          </div>
        </div>
      </div>
    </div>
  );
}
