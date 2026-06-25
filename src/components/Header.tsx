import { Phone } from "lucide-react";
import Logo from "@/components/Logo";

export default function Header() {
  const phone = process.env.NEXT_PUBLIC_CONTACT_PHONE || "+91 95552 17077";
  const telHref = `tel:${phone.replace(/[^\d+]/g, "")}`;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
      <div className="container-px flex h-16 items-center justify-between">
        <a href="#top" aria-label="AnalytixLabs home">
          <Logo />
        </a>

        <nav className="hidden items-center gap-7 text-sm font-medium text-ink lg:flex">
          <a href="#programs" className="hover:text-brand-700">Programs</a>
          <a href="#why" className="hover:text-brand-700">Why Classroom</a>
          <a href="#placements" className="hover:text-brand-700">Placements</a>
          <a href="#testimonials" className="hover:text-brand-700">Success Stories</a>
          <a href="#faq" className="hover:text-brand-700">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={telHref}
            className="hidden items-center gap-2 text-sm font-semibold text-navy hover:text-brand-700 sm:flex"
          >
            <Phone className="h-4 w-4" />
            {phone}
          </a>
          <a
            href="#lead-form"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-navy shadow-cta transition hover:bg-brand-400"
          >
            Book a Seat
          </a>
        </div>
      </div>
    </header>
  );
}
