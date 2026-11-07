"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AnimatePresence, motion } from "motion/react";
import { toDataURL } from "qrcode";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackupCodesPanel } from "@/components/auth/BackupCodesPanel";
import { RolePicker } from "@/components/auth/RolePicker";
import { DEMO_CREDENTIALS } from "@/components/auth/demo-credentials";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { SuccessCheck } from "@/components/motion/SuccessCheck";
import { getRepositories } from "@/lib/repositories";
import { collapse, fadeUp, stagger } from "@/lib/motion";
import { useAuthHydrated, useAuthStore } from "@/store/useAuthStore";
import {
  LOGIN_ERROR_MESSAGE,
  ROLE_HOME,
  ROLE_LABEL,
  type Role,
  type User,
} from "@/types/auth";

const SHOW_DEMO_CREDENTIALS =
  process.env.NEXT_PUBLIC_DEMO_CREDENTIALS === "true";
const REMEMBERED_USERNAME_KEY = "moka-pos.remembered-username";
const REMEMBERED_ROLE_KEY = "moka-pos.remembered-role";

const loginSchema = z.object({
  role: z.enum(["kasir", "admin"]),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean(),
});

type LoginValues = z.infer<typeof loginSchema>;

type Step = "credentials" | "mfa_challenge" | "mfa_setup" | "backup_codes" | "success";

/**
 * Renders the otpauth URI as a QR locally. The secret never leaves the page.
 */
function SetupQrCode({ value }: { value: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!value) return;

    let cancelled = false;
    void toDataURL(value, {
      width: 192,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) return null;

  return (
    <Image
      src={src}
      alt="QR code for adding Moka Cafe to your authenticator app"
      width={192}
      height={192}
      unoptimized
      className="size-48 rounded-lg border bg-white p-2"
    />
  );
}

export function LoginForm() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const session = useAuthStore((state) => state.session);
  const setSession = useAuthStore((state) => state.setSession);

  const [step, setStep] = useState<Step>("credentials");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [demoExpanded, setDemoExpanded] = useState(false);

  // MFA Challenge State
  const [mfaToken, setMfaToken] = useState<string>("");
  const [mfaCode, setMfaCode] = useState<string>("");
  const [isBackupCodeMode, setIsBackupCodeMode] = useState<boolean>(false);
  const [mfaSubmitting, setMfaSubmitting] = useState<boolean>(false);
  const [backupCodesRemaining, setBackupCodesRemaining] =
    useState<number | null>(null);

  // MFA Setup State (Mandatory Admin)
  const [setupToken, setSetupToken] = useState<string>("");
  const [setupUsername, setSetupUsername] = useState<string>("");
  const [setupSecret, setSetupSecret] = useState<string>("");
  const [setupQrUri, setSetupQrUri] = useState<string>("");
  const [setupConfirmCode, setSetupConfirmCode] = useState<string>("");
  const [secretCopied, setSecretCopied] = useState(false);
  const [uriCopied, setUriCopied] = useState(false);
  const [showRawUri, setShowRawUri] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Success Navigation Target
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      role: "kasir",
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  const role = useWatch({ control, name: "role" });
  const rememberMe = useWatch({ control, name: "rememberMe" });

  // Preload remembered username if previously stored
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      if (saved) {
        setValue("username", saved, { shouldValidate: true });
        setValue("rememberMe", true);
      }

      // Preselect the role this device used last, so a returning admin does
      // not have to notice the picker defaults to Cashier.
      const savedRole = localStorage.getItem(REMEMBERED_ROLE_KEY);
      if (savedRole === "admin" || savedRole === "kasir") {
        setValue("role", savedRole, { shouldValidate: true });
      }
    } catch {
      // Ignore storage access errors
    }
  }, [setValue]);

  // Already signed in: navigate to home
  useEffect(() => {
    if (!hydrated) return;
    if (session?.user && step === "credentials") {
      router.replace(ROLE_HOME[session.user.role]);
    }
  }, [hydrated, session, router, step]);

  /**
   * Closing the tab on the recovery-code screen would destroy the only copy of
   * those codes. Warn the browser before it lets that happen.
   */
  useEffect(() => {
    if (step !== "backup_codes") return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step]);

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

  function handleSuccess(user: User) {
    try {
      localStorage.setItem(REMEMBERED_ROLE_KEY, user.role);
    } catch {
      // Storage access blocked or restricted; the role hint is optional.
    }

    setPendingUser(user);
    setSession(user);
    setStep("success");
    setTimeout(() => {
      router.replace(ROLE_HOME[user.role]);
    }, 750);
  }

  async function onSubmit(values: LoginValues) {
    if (!useAuthStore.getState().hydrated) return;

    setFormError(null);

    // Update username persistence preference
    try {
      if (values.rememberMe) {
        localStorage.setItem(REMEMBERED_USERNAME_KEY, values.username);
      } else {
        localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      }
    } catch {
      // Storage access blocked or restricted
    }

    try {
      let result = await getRepositories().users.authenticate(
        values.username,
        values.password,
        values.role,
        values.rememberMe,
      );

      /**
       * The picker is a hint, not a gate. If the account belongs to the other
       * role, sign in as the account actually is instead of dead-ending the
       * admin on a form they have no reason to understand. Credentials and
       * password were already checked by the first attempt.
       */
      if (!result.ok && result.reason === "role-mismatch") {
        result = await getRepositories().users.authenticate(
          values.username,
          values.password,
          undefined,
          values.rememberMe,
        );
      }

      if (!result.ok) {
        setFormError(LOGIN_ERROR_MESSAGE[result.reason]);
        return;
      }

      if ("mfaRequired" in result && result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setBackupCodesRemaining(result.backupCodesRemaining);
        setStep("mfa_challenge");
        return;
      }

      if ("mfaSetupRequired" in result && result.mfaSetupRequired) {
        setSetupToken(result.setupToken);
        setSetupUsername(result.username);
        setSetupSecret(result.secret);
        setSetupQrUri(result.qrUri);
        setStep("mfa_setup");
        return;
      }

      if ("user" in result) {
        handleSuccess(result.user);
      }
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Cannot sign in right now. Please try again.",
      );
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaCode.trim()) return;

    setFormError(null);
    setMfaSubmitting(true);

    try {
      const result = await getRepositories().users.verifyMfa(
        mfaToken,
        mfaCode.trim(),
      );

      if (!result.ok) {
        setFormError(result.reason);
        setMfaSubmitting(false);
        return;
      }

      handleSuccess(result.user);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to verify code. Please try again.",
      );
      setMfaSubmitting(false);
    }
  }

  async function handleSetupConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!setupConfirmCode.trim()) return;

    setFormError(null);
    setMfaSubmitting(true);

    try {
      const result = await getRepositories().users.confirmMfaSetup(
        setupToken,
        setupConfirmCode.trim(),
      );

      if (!result.ok) {
        setFormError(result.reason);
        setMfaSubmitting(false);
        return;
      }

      setPendingUser(result.user);
      setBackupCodes(result.backupCodes);
      setSession(result.user);
      setStep("backup_codes");
      setMfaSubmitting(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to complete MFA enrollment. Please try again.",
      );
      setMfaSubmitting(false);
    }
  }

  function copySecret() {
    if (!setupSecret) return;
    void navigator.clipboard.writeText(setupSecret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  }

  function copyUri() {
    if (!setupQrUri) return;
    void navigator.clipboard.writeText(setupQrUri);
    setUriCopied(true);
    setTimeout(() => setUriCopied(false), 2000);
  }

  function handleOpenAuthenticator() {
    if (!setupQrUri) return;
    window.location.href = setupQrUri;
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="w-full max-w-md space-y-6"
    >
      {/* ---------------- STEP: SUCCESS STATE ---------------- */}
      {step === "success" ? (
        <motion.div
          variants={fadeUp}
          className="flex flex-col items-center justify-center space-y-4 py-12 text-center"
        >
          <div className="flex size-16 items-center justify-center rounded-2xl bg-success/10 text-success">
            <SuccessCheck className="size-10" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Authentication Verified
            </h2>
            <p className="text-sm text-muted-foreground">
              Welcome back, {pendingUser?.name}. Entering POS dashboard…
            </p>
          </div>
        </motion.div>
      ) : null}

      {/* ---------------- STEP: BACKUP CODES REVIEW ---------------- */}
      {step === "backup_codes" ? (
        <motion.div variants={fadeUp} className="space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              <ShieldCheck className="size-4" />
              <span>Two-Factor Authentication Active</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Save Your Recovery Backup Codes
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              These {backupCodes.length} codes can be used to sign in if you lose
              access to your authenticator app. Each code is strictly{" "}
              <strong>single-use</strong>.
            </p>
          </div>

          <BackupCodesPanel
            codes={backupCodes}
            username={pendingUser?.username}
            doneLabel="I have saved my codes • Continue to Dashboard"
            onDone={() => {
              if (pendingUser) {
                router.replace(ROLE_HOME[pendingUser.role]);
              }
            }}
          />
        </motion.div>
      ) : null}

      {/* ---------------- STEP: MFA SETUP (ADMIN ONBOARDING) ---------------- */}
      {step === "mfa_setup" ? (
        <motion.div variants={fadeUp} className="space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
              <ShieldAlert className="size-4" />
              <span>Administrator Security Policy</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Set Up Two-Factor Authentication
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Administrative access requires 2FA to safeguard customer data,
              stock movements, and store finances.
            </p>
          </div>

          <AnimatePresence initial={false}>
            {formError ? (
              <motion.div
                key="setup-error"
                variants={collapse}
                initial="hidden"
                animate="show"
                className="overflow-hidden"
              >
                <Alert
                  variant="destructive"
                  className="border-destructive/40 bg-destructive/5"
                >
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* ---------------- CONNECT AUTHENTICATOR APP ---------------- */}
          <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Smartphone className="size-3.5 text-primary" />
                  Step 1: Connect Authenticator
                </Label>
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-warning" />
                  <span className="text-[11px] font-medium text-warning">Awaiting verification</span>
                </div>
              </div>

              {setupQrUri ? (
                <div className="flex flex-col items-center gap-4 rounded-lg border bg-background p-4 sm:flex-row sm:items-start">
                  <SetupQrCode value={setupQrUri} />
                  <div className="space-y-2 text-center sm:text-left">
                    <p className="text-sm font-semibold">Scan with your authenticator</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Open Google Authenticator, 1Password, Bitwarden, or Apple
                      Passwords and scan this code.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={copyUri}
                      >
                        {uriCopied ? (
                          <>
                            <Check className="mr-1.5 size-3.5 text-success" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1.5 size-3.5" />
                            Copy setup link
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleOpenAuthenticator}
                      >
                        <ExternalLink className="mr-1.5 size-3.5" />
                        Open on this device
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      The open button works on phones. On a desktop, scan the QR
                      or copy the setup link.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Manual Secret Key Fallback */}
              <div className="space-y-2 pt-3 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <QrCode className="size-3.5" />
                    Or enter Secret Key manually:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRawUri(!showRawUri)}
                    className="text-[11px] text-primary hover:underline font-medium"
                  >
                    {showRawUri ? "Hide direct URI" : "View direct URI"}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-xs font-bold tracking-widest text-foreground select-all overflow-x-auto">
                    {setupSecret}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-9"
                    onClick={copySecret}
                  >
                    {secretCopied ? (
                      <>
                        <Check className="size-3 text-success mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3 mr-1" />
                        Copy Key
                      </>
                    )}
                  </Button>
                </div>

                {showRawUri && setupQrUri ? (
                  <div className="mt-2 rounded-lg border bg-background/80 p-2.5 font-mono text-[10px] break-all text-muted-foreground select-all leading-relaxed">
                    <div className="text-[10px] font-semibold text-foreground mb-1 uppercase tracking-wider">
                      Direct TOTP URI:
                    </div>
                    {setupQrUri}
                  </div>
                ) : null}

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>Account: <strong className="text-foreground">{setupUsername || "this account"}</strong></span>
                  <span>Interval: <strong className="text-foreground">30s</strong></span>
                  <span>Algorithm: <strong className="text-foreground">SHA1</strong></span>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSetupConfirm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-confirm-code" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-primary" />
                Step 2: Enter Verification Code
              </Label>
              <Input
                id="setup-confirm-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={setupConfirmCode}
                onChange={(e) => setSetupConfirmCode(e.target.value.replace(/\D/g, ""))}
                className="text-center font-mono text-xl font-bold tracking-widest h-12"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground text-center">
                Enter the 6-digit code currently shown in your Authenticator app
              </p>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={setupConfirmCode.length !== 6 || mfaSubmitting}
            >
              {mfaSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Verifying code…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  Confirm & Activate 2FA
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => {
                setFormError(null);
                setStep("credentials");
              }}
            >
              <ArrowLeft className="mr-1.5 size-3.5" />
              Cancel & Return to sign in
            </Button>
          </form>
        </motion.div>
      ) : null}

      {/* ---------------- STEP: MFA CHALLENGE ---------------- */}
      {step === "mfa_challenge" ? (
        <motion.div variants={fadeUp} className="space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <KeyRound className="size-4" />
              <span>Two-Step Verification</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {isBackupCodeMode ? "Enter Backup Recovery Code" : "Security Code"}
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isBackupCodeMode
                ? "Enter one of your 12-character single-use recovery codes (e.g. a1b2c3-d4e5f6)."
                : "Open your authenticator app and enter the 6-digit passcode."}
            </p>
          </div>

          {backupCodesRemaining !== null && backupCodesRemaining <= 2 ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-warning"
                aria-hidden
              />
              <p className="text-xs leading-relaxed text-warning">
                {backupCodesRemaining === 0
                  ? "You have no backup codes left. After signing in, regenerate a fresh set from Security."
                  : `Only ${backupCodesRemaining} backup code${backupCodesRemaining === 1 ? "" : "s"} left. After signing in, regenerate a fresh set from Security.`}
              </p>
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {formError ? (
              <motion.div
                key="mfa-error"
                variants={collapse}
                initial="hidden"
                animate="show"
                className="overflow-hidden"
              >
                <Alert
                  variant="destructive"
                  className="border-destructive/40 bg-destructive/5"
                >
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <form onSubmit={handleMfaVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code">
                {isBackupCodeMode ? "Backup Code" : "6-Digit Code"}
              </Label>
              <Input
                id="mfa-code"
                type="text"
                autoComplete="one-time-code"
                placeholder={isBackupCodeMode ? "xxxxxx-xxxxxx" : "000000"}
                maxLength={isBackupCodeMode ? 13 : 6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="text-center font-mono text-lg font-bold tracking-widest"
                autoFocus
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={mfaCode.length < 6 || mfaSubmitting}
            >
              {mfaSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Authenticating…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  Verify & Sign in
                </>
              )}
            </Button>

            <div className="flex flex-col gap-2 pt-2 text-center text-xs">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setIsBackupCodeMode(!isBackupCodeMode);
                  setMfaCode("");
                  setFormError(null);
                }}
              >
                {isBackupCodeMode
                  ? "Switch to standard authenticator app code"
                  : "Lost your device? Use a backup recovery code"}
              </button>

              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setFormError(null);
                  setStep("credentials");
                }}
              >
                Back to credentials
              </button>

              <p className="mx-auto max-w-xs pt-1 text-[11px] leading-relaxed text-muted-foreground">
                No device and no backup codes? Another admin can reset your
                two-factor authentication from <strong>Users</strong>. If you
                are the only admin, the server operator can run{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  npm run mfa:reset
                </code>
                .
              </p>
            </div>
          </form>
        </motion.div>
      ) : null}

      {/* ---------------- STEP: PRIMARY CREDENTIALS ---------------- */}
      {step === "credentials" ? (
        <>
          <motion.div
            variants={fadeUp}
            className="space-y-3 text-center lg:text-left"
          >
            {/* Small screens brand bar */}
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
              Moka Cafe POS
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-balance">
              Sign in to your station
            </h1>
            <p className="text-sm text-muted-foreground">
              Select your role and enter your staff credentials to begin.
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
                onChange={(next) =>
                  setValue("role", next, { shouldValidate: true })
                }
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

            {/* Username Input */}
            <motion.div variants={fadeUp} className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                spellCheck={false}
                placeholder="e.g. kasir or admin…"
                aria-invalid={Boolean(errors.username)}
                aria-describedby={errors.username ? "username-error" : undefined}
                className="h-10"
                {...register("username")}
              />
              {errors.username ? (
                <p id="username-error" className="text-xs text-destructive">
                  {errors.username.message}
                </p>
              ) : null}
            </motion.div>

            {/* Password Input with Visibility Toggle & Caps Lock Detection */}
            <motion.div variants={fadeUp} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => setForgotPasswordOpen(true)}
                  className="text-xs font-medium text-primary hover:underline focus-visible:outline-hidden"
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="h-10 pr-10"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  onKeyDown={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
                  onKeyUp={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>

              {capsLockOn ? (
                <div className="flex items-center gap-1.5 text-xs text-warning font-medium pt-0.5">
                  <AlertCircle className="size-3.5" />
                  <span>Caps Lock is ON</span>
                </div>
              ) : null}

              {errors.password ? (
                <p id="password-error" className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              ) : null}
            </motion.div>

            {/* Remember Me Checkbox */}
            <motion.div
              variants={fadeUp}
              className="flex items-center space-x-2 pt-1"
            >
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) =>
                  setValue("rememberMe", Boolean(checked))
                }
              />
              <Label
                htmlFor="rememberMe"
                className="text-xs font-normal text-muted-foreground cursor-pointer select-none"
              >
                Remember my username on this device
              </Label>
            </motion.div>

            {/* Submit Button */}
            <motion.div variants={fadeUp}>
              <Button
                type="submit"
                size="lg"
                className="w-full font-semibold shadow-sm transition-all"
                disabled={!hydrated || isSubmitting}
                aria-busy={!hydrated || isSubmitting}
              >
                {!hydrated ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Checking station session…
                  </>
                ) : isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Authenticating credentials…
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

          {/* Demo Accounts Pill Drawer */}
          {SHOW_DEMO_CREDENTIALS ? (
            <motion.div
              variants={fadeUp}
              className="rounded-xl border bg-muted/30 p-3 text-xs"
            >
              <button
                type="button"
                onClick={() => setDemoExpanded(!demoExpanded)}
                className="flex w-full items-center justify-between font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>Demo Accounts (Click to Fill)</span>
                {demoExpanded ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>

              {demoExpanded ? (
                <div className="grid gap-2 pt-3 sm:grid-cols-2">
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
                      className="rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:border-primary hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
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
              ) : null}
            </motion.div>
          ) : null}

          {/* Accessible Forgot Password Dialog */}
          <ForgotPasswordDialog
            open={forgotPasswordOpen}
            onOpenChange={setForgotPasswordOpen}
          />
        </>
      ) : null}
    </motion.div>
  );
}
