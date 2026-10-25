import { cn } from "@/lib/utils"

function Skeleton({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      /**
       * The pulse is a loading indicator with no other accessible signal, so it
       * is the one animation here that is worth suppressing outright: an
       * indefinite loop is exactly what a reduced-motion user cannot tolerate.
       * The shimmer overlay is hidden under the same preference; the muted
       * block is still a perfectly readable placeholder without either.
       */
      className={cn(
        "relative animate-pulse overflow-hidden rounded-md bg-muted motion-reduce:animate-none",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/50 to-transparent motion-safe:animate-[shimmer_1.6s_ease-in-out_infinite] motion-reduce:hidden dark:via-white/10"
      />
      {children}
    </div>
  )
}

export { Skeleton }