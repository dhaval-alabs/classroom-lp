import { MapPin, Phone, Mail } from "lucide-react";
import Logo from "@/components/Logo";

export default function Footer() {
  const phone = process.env.NEXT_PUBLIC_CONTACT_PHONE || "+91 95552 17077";
  const telHref = `tel:${phone.replace(/[^\d+]/g, "")}`;

  return (
    <footer className="border-t border-slate-100 bg-slate-50">
      <div className="container-px flex flex-col items-center gap-6 py-12 text-center">
        <Logo />

        <div className="flex flex-col items-center gap-2 text-sm text-muted sm:flex-row sm:gap-6">
          <a href={telHref} className="flex items-center gap-2 hover:text-brand-700">
            <Phone className="h-4 w-4 text-brand-700" /> {phone}
          </a>
          <a href="mailto:admissions@analytixlabs.co.in" className="flex items-center gap-2 hover:text-brand-700">
            <Mail className="h-4 w-4 text-brand-700" /> admissions@analytixlabs.co.in
          </a>
        </div>

        <div className="flex items-center gap-2 text-sm font-medium text-navy">
          <MapPin className="h-4 w-4 text-brand-700" />
          <span>Gurgaon · Noida · Bangalore</span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <a href="#" className="hover:text-navy">Privacy</a>
          <a href="#" className="hover:text-navy">Terms</a>
          <a href="#faq" className="hover:text-navy">FAQ</a>
          <a href={telHref} className="hover:text-navy">Contact</a>
        </nav>

        <p className="text-xs text-slate-400">
          © {new Date().getFullYear()} AnalytixLabs India. Global Headquarters: Gurgaon, India.
        </p>
      </div>
    </footer>
  );
}
