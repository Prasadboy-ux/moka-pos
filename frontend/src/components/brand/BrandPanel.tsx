import Image from "next/image";
import { CheckCircle2, Coffee, ShieldCheck, Zap } from "lucide-react";

export function BrandPanel() {
  return (
    <aside className="brand-gradient-motion relative hidden overflow-hidden bg-linear-to-br from-brand-cyan via-brand-blue to-brand-navy p-12 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
      {/* Decorative blurred background orbs */}
      <div
        aria-hidden
        className="animate-brand-float absolute -top-24 -right-24 size-96 rounded-full bg-white/15 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden
        className="animate-brand-float-alt absolute -bottom-32 -left-16 size-80 rounded-full bg-[#009bb0]/40 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden
        className="animate-brand-float absolute top-1/3 -left-24 size-64 rounded-full bg-brand-cyan/25 blur-3xl [animation-delay:-6s] pointer-events-none"
      />

      {/* Header Logo */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white shadow-lg shadow-black/10 transition-transform hover:scale-105">
            <Image
              src="/brand/moka-mark.svg"
              alt="Moka Cafe logo"
              width={32}
              height={32}
              priority
              className="size-8"
            />
          </div>
          <div>
            <span translate="no" className="block text-lg font-bold tracking-tight">
              Moka Cafe
            </span>
            <span className="block text-[11px] font-medium tracking-wide text-white/70 uppercase">
              Point of Sale & Management
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-md">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>System Online</span>
        </div>
      </div>

      {/* Center Hero & Live Feature Preview Card */}
      <div className="relative space-y-8 my-auto">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-xs">
            <Coffee className="size-3.5 text-amber-200" />
            <span>Artisan POS Workflow</span>
          </div>
          <h2 className="max-w-md text-3xl xl:text-4xl leading-tight font-extrabold tracking-tight text-balance text-white">
            Serving every cup with precision & security.
          </h2>
          <p className="max-w-md text-sm xl:text-base leading-relaxed text-white/80">
            One connected system for the counter, the stock room, and the back
            office. Orders, recipes, and sales stay synchronized in real time.
          </p>
        </div>

        {/* Operational Highlights Card */}
        <div className="max-w-md rounded-2xl border border-white/20 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between text-xs font-semibold tracking-wider text-white/80 uppercase">
            <span>Operational Resilience</span>
            <span className="text-emerald-300">Live POS Protection</span>
          </div>
          <ul className="space-y-2.5 text-xs text-white/90">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-300" />
              <span>Multi-document transaction safety for cashier checkouts</span>
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 shrink-0 text-cyan-200" />
              <span>Argon2id hashing & optional two-factor authenticator support</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Zap className="size-4 shrink-0 text-amber-300" />
              <span>Automatic recipe-based ingredient stock ledger synchronization</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Footer Meta */}
      <div className="relative flex items-center justify-between border-t border-white/15 pt-6 text-xs text-white/60 font-medium">
        <span>Moka Cafe POS Platform</span>
        <span>Version 2.0 • Enterprise Edition</span>
      </div>
    </aside>
  );
}
