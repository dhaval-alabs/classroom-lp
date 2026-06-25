import Image from "next/image";
import LeadForm from "@/components/LeadForm";

const heroStats = [
  { value: "21,000+", label: "Careers transformed" },
  { value: "200%", label: "Avg. salary hike" },
  { value: "500+", label: "Hiring partners" },
];

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-white">
      {/* background accents */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-36 h-[600px] w-[600px] rounded-full bg-brand/10 blur-[120px]" />
        <div className="absolute -bottom-28 -left-24 h-[500px] w-[500px] rounded-full bg-navy/5 blur-[120px]" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 opacity-[0.05]">
          <Image src="/brand/hero-bg.jpg" alt="" fill priority className="object-contain" />
        </div>
      </div>

      <div className="relative mx-auto grid max-w-5xl grid-cols-1 items-start gap-8 px-6 py-8 lg:grid-cols-2 md:py-12">
        {/* Left content */}
        <div className="z-10 animate-fade-up">
          {/* eyebrow pill */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-4 py-2 text-sm font-semibold text-navy">
            🎓 Offline Classroom Batches · Industry-Expert Mentors
          </div>

          {/* date / urgency strip */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-navy to-navy-700 px-3 py-2 text-white shadow-md shadow-navy/20">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-xs font-extrabold uppercase tracking-wider">Admissions Open</span>
              <span className="font-bold text-brand">•</span>
              <span className="text-xs font-extrabold uppercase tracking-wider">New Batch Soon</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-wider text-red-600">
              Filling Fast
            </div>
          </div>

          {/* headline */}
          <h1 className="mb-5 text-3xl font-bold leading-tight tracking-tight text-navy md:text-4xl lg:text-5xl">
            Become a <span className="text-brand-700">Data Science &amp; AI</span> professional with our{" "}
            <span className="text-brand-700">offline classroom batches</span>
          </h1>

          <p className="mb-6 max-w-md text-base font-normal leading-relaxed text-slate-600">
            Job-oriented, hands-on training in Data Science, Generative AI &amp; Analytics — taught
            in person by industry experts at our Gurgaon, Noida &amp; Bangalore centres.
          </p>

          {/* stats */}
          <div className="mb-3 mt-2 grid grid-cols-3 gap-2">
            {heroStats.map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                <div className="text-xl font-bold text-navy">{s.value}</div>
                <div className="mt-0.5 text-[10px] font-semibold text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-normal italic text-slate-400">
            Figures as per AnalytixLabs internal placement data.
          </p>

          {/* partnership logos */}
          <div className="mt-8">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              In Partnership With
            </p>
            <div className="relative h-24 w-full max-w-xl sm:h-28">
              <Image
                src="/brand/accreditations.png"
                alt="TIH Foundation at IIT Bombay, TIH at IIT Patna, FutureSkills Prime — NASSCOM"
                fill
                sizes="(max-width: 768px) 100vw, 640px"
                className="object-contain object-left"
              />
            </div>
          </div>
        </div>

        {/* Right form card */}
        <div className="relative z-10 animate-fade-up">
          <div className="absolute inset-0 rounded-full bg-brand/5 opacity-50 blur-[100px]" />
          <div className="relative">
            <LeadForm />
          </div>
        </div>
      </div>
    </section>
  );
}
