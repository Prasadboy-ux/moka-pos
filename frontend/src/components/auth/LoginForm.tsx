"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnimatePresence, motion } from "motion/react";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RolePicker } from "@/components/auth/RolePicker";
import { DEMO_CREDENTIALS } from "@/components/auth/demo-credentials";
import { getRepositories } from "@/lib/repositories";
import { collapse, fadeUp, stagger } from "@/lib/motion";
import { useAuthHydrated, useAuthStore } from "@/store/useAuthStore";
import {
  LOGIN_ERROR_MESSAGE,
  ROLE_HOME,
  ROLE_LABEL,
  type Role,
} from "@/types/auth";

/**
 * The seeded accounts are part of the demo, not a real deployment. The panel is
 * hidden unless NEXT_PUBLIC_DEMO_CREDENTIALS=true is set at build time, so a
 * forgotten variable fails closed rather than advertising admin credentials on
 * a live sign-in page. The accounts themselves still have to be replaced in the
 * database; the API refuses to start in production if they still work.
 */
const SHOW_DEMO_CREDENTIALS =
  process.env.NEXT_PUBLIC_DEMO_CREDENTIALS === "true";

const loginSchema = z.object({
  role: z.enum(["kasir", "admin"]),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const session = useAuthStore((state) => state.session);
  const setSession = useAuthStore((state) => state.setSession);

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { role: "kasir", username: "", password: "" },
  });

  const role = useWatch({ control, name: "role" });

  // Already signed in: skip the login screen entirely.
  useEffect(() => {
    if (!hydrated) return;
    if (session?.user) {
      router.replace(ROLE_HOME[session.user.role]);
    }
  }, [hydrated, session, router]);

  function fillDemoCredentials(
    demoRole: Role,
    username: string,
    password: string,
  ) {
    setValue("role", demoRole, { shouldValidate: true });
    setValue("username", username, { shouldValidate: true });
    setValue("password", password, { shouldValidate: true });
    setFormError(null);
  }

  async function onSubmit(values: LoginValues) {
    // The effect that reads an existing session is still in flight. Signing in
    // now would race that response: a late 401 could erase the new session, or
    // a late 200 could replace it with the old user.
    if (!useAuthStore.getState().hydrated) return;

    setFormError(null);

    try {
      const result = await getRepositories().users.authenticate(
        values.username,
        values.password,
        values.role,
      );

      if (!result.ok) {
        setFormError(LOGIN_ERROR_MESSAGE[result.reason]);
        return;
      }

      setSession(result.user);
      router.replace(ROLE_HOME[result.user.role]);
    } catch (error) {
      // Rate limits and network failures reach here as an ApiError. Showing its
      // message keeps the reason distinct from a wrong password.
      setFormError(
        error instanceof Error
          ? error.message
          : "Cannot sign in right now. Please try again.",
      );
    }
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="w-full max-w-md space-y-7"
    >
      <motion.div variants={fadeUp} className="space-y-3 text-center lg:text-left">
        {/*
          Small screens get the logo row; large screens get the tracked eyebrow.
          Both used to render at once and print "Moka Cafe" twice.
        */}
        <div className="flex items-center justify-center gap-3 lg:hidden">
          <div className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-brand-cyan to-brand-navy shadow-sm">
            <Image
              src="/brand/moka-mark.svg"
              alt="Moka Cafe logo"
              width={24}
              height={24}
              priority
              className="size-6"
            />
          </div>
          <span translate="no" className="text-base font-bold tracking-tight">
            Moka Cafe
          </span>
        </div>

        <p
          translate="no"
          className="hidden text-xs font-semibold tracking-[0.3em] text-primary uppercase lg:block"
        >
          Moka Cafe
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-balance">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to start your shift at the counter.
        </p>
      </motion.div>

      <motion.form
        variants={stagger}
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        <motion.div variants={fadeUp}>
          <RolePicker
            value={role}
            onChange={(next) => setValue("role", next, { shouldValidate: true })}
          />
        </motion.div>

        <AnimatePresence initial={false}>
          {formError ? (
            <motion.div
              key="form-error"
              variants={collapse}
              initial="hidden"
              animate="show"
              className="overflow-hidden"
            >
              <Alert
                variant="destructive"
                role="alert"
                aria-live="assertive"
                className="border-destructive/40 bg-destructive/5"
              >
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div variants={fadeUp} className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            spellCheck={false}
            placeholder="e.g. kasir…"
            aria-invalid={Boolean(errors.username)}
            aria-describedby={errors.username ? "username-error" : undefined}
            {...register("username")}
          />
          {errors.username ? (
            <p id="username-error" className="text-xs text-destructive">
              {errors.username.message}
            </p>
          ) : null}
        </motion.div>

        <motion.div variants={fadeUp} className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="pr-10"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>
          {errors.password ? (
            <p id="password-error" className="text-xs text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </motion.div>

        <motion.div variants={fadeUp}>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!hydrated || isSubmitting}
            aria-busy={!hydrated || isSubmitting}
          >
            {!hydrated ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Checking session…
              </>
            ) : isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Signing in…
              </>
            ) : (
              <>
                <LogIn className="size-4" aria-hidden />
                Sign in as {ROLE_LABEL[role]}
              </>
            )}
          </Button>
        </motion.div>
      </motion.form>

      {SHOW_DEMO_CREDENTIALS ? (
        <motion.div
          variants={fadeUp}
          className="rounded-xl border border-dashed bg-muted/40 p-4"
        >
          <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Demo accounts - click to fill
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DEMO_CREDENTIALS.map((demo) => (
              <button
                key={demo.username}
                type="button"
                onClick={() =>
                  fillDemoCredentials(
                    demo.role,
                    demo.username,
                    demo.password,
                  )
                }
                className="rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:border-primary hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <span className="block text-xs font-semibold text-foreground">
                  {ROLE_LABEL[demo.role]}
                </span>
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {demo.username} / {demo.password}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
