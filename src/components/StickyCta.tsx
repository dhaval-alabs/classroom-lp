"use client";

import { useEffect, useState } from "react";

const SCROLL_THRESHOLD = 0.15;

/** Slide-up sticky action bar (desktop + mobile) — appears after a short scroll. */
export default function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-6px_20px_rgba(0,51,104,0.12)] backdrop-blur-md transition-all duration-300 ease-out md:px-6 md:py-4 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        {/* Message — desktop only */}
        <div className="hidden md:flex md:items-center md:gap-3 md:leading-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fire.gif" alt="" aria-hidden="true" className="h-10 w-10 flex-shrink-0" />
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-widest text-brand-700">
              Offline batches · Gurgaon · Noida · Bangalore
            </span>
            <span className="text-base font-extrabold text-navy">
              Limited seats — reserve yours before this batch fills.
            </span>
          </div>
        </div>

        {/* CTA — full-width tap target on mobile, natural width on desktop */}
        <a
          href="#register"
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-navy px-5 py-3.5 font-bold text-white shadow-lg shadow-navy/30 transition-all hover:bg-navy-800 active:scale-[0.98] md:w-auto md:flex-shrink-0 md:justify-start md:px-7 md:py-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fire.gif" alt="" aria-hidden="true" className="h-8 w-8 flex-shrink-0 md:hidden" />
          <span className="flex flex-col text-left leading-tight md:hidden">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand">
              Offline · Free counselling
            </span>
            <span className="text-sm font-extrabold text-white">Book Your Free Seat Now</span>
          </span>
          <span className="hidden text-sm font-extrabold uppercase tracking-wider md:inline">
            Book Your Free Seat Now
          </span>
          <span className="text-xl leading-none text-brand">→</span>
        </a>
      </div>
    </div>
  );
}
