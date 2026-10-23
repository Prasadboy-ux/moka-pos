import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      /**
       * The pulse is a loading indicator with no other accessible signal, so it
       * is the one animation here that is worth suppressing outright: an
       * indefinite loop is exactly what a reduced-motion user cannot tolerate.
       */
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }