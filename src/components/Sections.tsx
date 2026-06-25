import Image from "next/image";
import {
  Award,
  BadgeCheck,
  CalendarClock,
  Clock,
  GraduationCap,
  Quote,
  Users,
} from "lucide-react";
import {
  stats,
  programs,
  whyClassroom,
  curriculum,
  hiringPartners,
  testimonials,
} from "@/lib/site";

/* ── Stats bar ─────────────────────────────────────────────── */
export function TrustBar() {
  return (
    <section className="border-b border-slate-100 bg-soft">
      <div className="container-px grid grid-cols-2 gap-6 py-8 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-2xl font-extrabold text-navy sm:text-3xl">{s.value}</div>
            <div className="mt-1 text-xs font-medium text-muted sm:text-sm">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Accreditations strip ──────────────────────────────────── */
export function Accreditations() {
  return (
    <section className="border-b border-slate-100 bg-white py-10">
      <div className="container-px text-center">
        <p className="mb-6 text-xs font-bold uppercase tracking-wider text-muted">
          Recognised &amp; accredited by
        </p>
        <Image
          src="/brand/accreditations.png"
          alt="TIH Foundation IIT Bombay, TIH IIT Patna, FutureSkills Prime — NASSCOM"
          width={2038}
          height={625}
          className="mx-auto h-auto w-full max-w-3xl opacity-90"
        />
      </div>
    </section>
  );
}

/* ── Why classroom ─────────────────────────────────────────── */
export function WhyClassroom() {
  return (
    <section id="why" className="section">
      <div className="container-px">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Why offline</span>
          <h2 className="h2">The classroom advantage</h2>
          <p className="mt-3 text-muted">
            Self-paced videos have a 90% drop-off rate. Our in-person batches keep you
            accountable, supported and job-ready.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {whyClassroom.map((item, i) => {
            const Icon = [Users, GraduationCap, Award, BadgeCheck][i] ?? Users;
            return (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card transition hover:-translate-y-1"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-brand-700">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-navy">{item.title}</h3>
                <p className="mt-2 text-sm text-muted">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Programs ──────────────────────────────────────────────── */
export function Programs() {
  return (
    <section id="programs" className="section bg-soft">
      <div className="container-px">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Choose your track</span>
          <h2 className="h2">Offline programs that get you hired</h2>
          <p className="mt-3 text-muted">
            Industry-designed curriculum with live projects, taught at our Gurgaon, Noida &
            Bangalore centres.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {programs.map((p) => (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-card ${
                p.popular ? "border-brand ring-1 ring-brand" : "border-slate-100"
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-xs font-bold text-navy">
                  Most popular
                </span>
              )}
              <h3 className="text-xl font-bold text-navy">{p.name}</h3>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-brand-700" /> {p.duration}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4 text-brand-700" /> {p.hours}
                </span>
              </div>
              <p className="mt-4 flex-1 text-sm text-muted">{p.blurb}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {p.tags.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
              <a href="#lead-form" className="btn-primary mt-6 w-full">
                Get curriculum & fees
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Curriculum highlights ─────────────────────────────────── */
export function Curriculum() {
  return (
    <section className="section">
      <div className="container-px grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="eyebrow">What you&apos;ll master</span>
          <h2 className="h2">A curriculum built with hiring partners</h2>
          <p className="mt-3 text-muted">
            From fundamentals to Generative & Agentic AI — every module is hands-on and
            project-backed, mapped to what employers actually hire for.
          </p>
          <a href="#lead-form" className="btn-primary mt-6">
            Download full syllabus
          </a>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {curriculum.map((c) => (
            <div
              key={c}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 text-sm font-medium text-ink shadow-sm"
            >
              <BadgeCheck className="h-5 w-5 shrink-0 text-brand-700" />
              {c}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Placements / hiring partners logo wall ────────────────── */
export function Placements() {
  const row = [...hiringPartners, ...hiringPartners];
  return (
    <section id="placements" className="section bg-soft">
      <div className="container-px text-center">
        <span className="eyebrow">Placements</span>
        <h2 className="h2">Our learners work at 500+ companies</h2>
        <p className="mx-auto mt-3 max-w-2xl text-muted">
          Dedicated placement cell with resume reviews, mock interviews and direct referrals.
        </p>
      </div>

      <div className="relative mt-12 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <div className="flex w-max animate-marquee items-center gap-14">
          {row.map((c, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={`${c.slug}-${i}`}
              src={`/brand/companies/${c.slug}.svg`}
              alt={c.name}
              loading="lazy"
              className="h-9 w-auto shrink-0 opacity-80 transition hover:opacity-100 md:h-11"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Testimonials ──────────────────────────────────────────── */
export function Testimonials() {
  return (
    <section id="testimonials" className="section">
      <div className="container-px">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Success stories</span>
          <h2 className="h2">Real learners. Real career jumps.</h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-card"
            >
              <Quote className="h-8 w-8 text-brand/30" />
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-ink">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                  {t.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <div className="text-sm font-bold text-navy">{t.name}</div>
                  <div className="text-xs text-muted">{t.role}</div>
                </div>
                <span className="ml-auto rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-600">
                  {t.hike}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Urgency / batch dates CTA ─────────────────────────────── */
export function BatchUrgency() {
  return (
    <section className="section">
      <div className="container-px">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-800 px-6 py-12 text-center text-white sm:px-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/20 blur-3xl" />
          <span className="chip bg-brand/15 text-brand">
            <CalendarClock className="h-3.5 w-3.5" /> Next batch filling fast
          </span>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Limited seats in the upcoming classroom batch
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/75">
            New weekend & weekday batches start soon across all centres. Register now and our
            counsellor will lock your seat and share exact dates.
          </p>
          <a href="#lead-form" className="btn-primary mt-7">
            Reserve My Seat →
          </a>
        </div>
      </div>
    </section>
  );
}
