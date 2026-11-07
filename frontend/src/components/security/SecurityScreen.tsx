"use client";

import * as React from "react";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { BackupCodesPanel } from "@/components/auth/BackupCodesPanel";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useAsync } from "@/hooks/useAsync";
import { getRepositories } from "@/lib/repositories";
import { useAuthStore } from "@/store/useAuthStore";

async function loadStatus() {
  return getRepositories().users.mfaStatus();
}

/**
 * The signed-in account's security settings.
 *
 * Recovery codes are the weak point of any TOTP setup: they are shown once and
 * forgotten just as easily. This screen is the place to see how many are left
 * and to replace the set before it runs out — without needing another admin.
 */
export function SecurityScreen() {
  const user = useAuthStore((state) => state.session?.user ?? null);
  const { data, error, isLoading, reload } = useAsync(loadStatus);
  const { toast } = useToast();

  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [freshCodes, setFreshCodes] = React.useState<string[] | null>(null);

  const mfaEnabled = data?.mfaEnabled ?? false;
  const remaining = data?.backupCodesRemaining ?? 0;

  /**
   * A reload would discard the only copy of the freshly generated codes. The
   * acknowledgement checkbox is the intended exit; this is the safety net for
   * an accidental refresh or tab close.
   */
  React.useEffect(() => {
    if (!freshCodes) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [freshCodes]);

  async function handleRegenerate(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFormError(null);

    try {
      const result = await getRepositories().users.regenerateBackupCodes(
        currentPassword,
        code,
      );

      if (!result.ok) {
        setFormError(result.reason);
        return;
      }

      setFreshCodes(result.backupCodes);
      setRegenerating(false);
      setCurrentPassword("");
      setCode("");
      toast({
        title: "Recovery codes regenerated",
        description: "Every old code has stopped working.",
        variant: "success",
      });
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Could not regenerate the codes. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Two-factor authentication and the codes that get you back in."
      />

      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  {mfaEnabled ? (
                    <ShieldCheck className="size-4 text-success" aria-hidden />
                  ) : (
                    <ShieldOff
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  Two-factor authentication
                </CardTitle>
                <Badge
                  variant={
                    isLoading ? "outline" : mfaEnabled ? "default" : "secondary"
                  }
                >
                  {isLoading ? "Checking" : mfaEnabled ? "On" : "Off"}
                </Badge>
              </div>
              <CardDescription>
                A 6-digit authenticator code is required when this account signs
                in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : isLoading ? (
                <p className="text-xs text-muted-foreground">
                  Checking recovery codes…
                </p>
              ) : mfaEnabled ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tabular-nums">
                      {remaining}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      of 8 single-use recovery codes left
                    </span>
                  </div>

                  {remaining <= 2 ? (
                    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
                      <AlertTriangle
                        className="mt-0.5 size-4 shrink-0 text-warning"
                        aria-hidden
                      />
                      <p className="text-xs leading-relaxed text-warning">
                        {remaining === 0
                          ? "You have used every recovery code. If you lose your authenticator now, you will be locked out."
                          : "You are running low. Regenerate a fresh set before the last code is used."}
                      </p>
                    </div>
                  ) : null}

                  {!regenerating ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRegenerating(true)}
                    >
                      <RefreshCw className="mr-1.5 size-4" aria-hidden />
                      Regenerate recovery codes
                    </Button>
                  ) : (
                    <form
                      onSubmit={handleRegenerate}
                      className="space-y-3 rounded-lg border bg-muted/20 p-3"
                    >
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Confirm your password and a current authenticator code.
                        Every old recovery code will stop working.
                      </p>

                      {formError ? (
                        <p className="text-xs text-destructive">{formError}</p>
                      ) : null}

                      <div className="space-y-2">
                        <Label
                          htmlFor="regen-password"
                          className="text-xs font-medium"
                        >
                          Current password
                        </Label>
                        <Input
                          id="regen-password"
                          type="password"
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(event) =>
                            setCurrentPassword(event.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="regen-code"
                          className="text-xs font-medium"
                        >
                          6-digit authenticator code
                        </Label>
                        <Input
                          id="regen-code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="000000"
                          maxLength={6}
                          value={code}
                          onChange={(event) =>
                            setCode(event.target.value.replace(/\D/g, ""))
                          }
                          className="font-mono tracking-widest"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={
                            pending ||
                            currentPassword.length === 0 ||
                            code.length !== 6
                          }
                        >
                          {pending ? (
                            <Loader2
                              className="mr-1.5 size-4 animate-spin"
                              aria-hidden
                            />
                          ) : null}
                          Generate new codes
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            setRegenerating(false);
                            setFormError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  This account is not enrolled. An admin account is asked to set
                  up an authenticator the next time it signs in.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4" aria-hidden />
                Password
              </CardTitle>
              <CardDescription>
                Changing your password signs out every device, including this
                one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasswordOpen(true)}
              >
                Change password
              </Button>
            </CardContent>
          </Card>
      </div>

      <Dialog
        open={freshCodes !== null}
        onOpenChange={() => {
          // Deliberately not dismissible. Closing it without saving loses the
          // only copy of these codes; the acknowledgement button is the exit.
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-xl"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Save your new recovery codes</DialogTitle>
            <DialogDescription>
              These replace every code you had before. They are shown once and
              cannot be displayed again.
            </DialogDescription>
          </DialogHeader>
          {freshCodes ? (
            <BackupCodesPanel
              codes={freshCodes}
              username={user?.username}
              doneLabel="I have saved these codes"
              onDone={() => {
                setFreshCodes(null);
                reload();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </div>
  );
}
