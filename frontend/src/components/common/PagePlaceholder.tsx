import type { LucideIcon } from "lucide-react";

interface PagePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  milestone: string;
}

/**
 * Temporary stand-in for a screen that has not been built yet, so every route
 * resolves while the app is developed module by module.
 */
export function PagePlaceholder({
  title,
  description,
  icon: Icon,
  milestone,
}: PagePlaceholderProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-20 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        <Icon className="size-6" aria-hidden />
      </div>

      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      <p className="mt-6 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        Scheduled for {milestone}
      </p>
    </div>
  );
}