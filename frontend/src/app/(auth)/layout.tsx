import { BrandPanel } from "@/components/brand/BrandPanel";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <BrandPanel />
      {/* `id` matches the skip link in the root layout — without it the first
          tab stop on /login points at nothing. */}
      <main
        id="main"
        className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}