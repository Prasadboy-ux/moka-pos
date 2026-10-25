import Image from "next/image";

export function BrandPanel() {
  return (
    <aside className="brand-gradient-motion relative hidden overflow-hidden bg-linear-to-br from-brand-cyan via-brand-blue to-brand-navy p-12 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
      {/*
        Decorative blurred orbs. They drift on independent, slow loops so the
        panel breathes without ever pulling the eye away from the form.
      */}
      <div
        aria-hidden
        className="animate-brand-float absolute -top-24 -right-24 size-96 rounded-full bg-white/15 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-brand-float-alt absolute -bottom-32 -left-16 size-80 rounded-full bg-[#009bb0]/40 blur-3xl"
      />
      <div
        aria-hidden
        className="animate-brand-float absolute top-1/3 -left-24 size-64 rounded-full bg-brand-cyan/25 blur-3xl [animation-delay:-6s]"
      />

      <div className="relative flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-white shadow-lg">
          <Image
            src="/brand/moka-mark.svg"
            alt="Moka Cafe logo"
            width={32}
            height={32}
            priority
            className="size-8"
          />
        </div>
        <span translate="no" className="text-lg font-bold tracking-tight">Moka Cafe</span>
      </div>

      <div className="relative space-y-6">
        <blockquote className="max-w-md text-3xl leading-snug font-semibold tracking-tight text-balance">
          Serving every cup with precision.
        </blockquote>
        <p className="max-w-sm text-sm leading-relaxed text-white/75">
          One system for the counter, the stock room, and the back office.
          Orders, recipes, and reports stay in sync from the first sale of the
          morning to the last.
        </p>
      </div>

      <p className="relative text-xs font-semibold tracking-[0.35em] text-white/60 uppercase">
        Point of Sale
      </p>
    </aside>
  );
}