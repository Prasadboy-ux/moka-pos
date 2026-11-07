"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface BackupCodesPanelProps {
  codes: string[];
  /** Shown in the downloaded/printed copy so the file is identifiable. */
  username?: string;
  onDone: () => void;
  doneLabel?: string;
  /** Require the "I saved these" checkbox before Continue is enabled. */
  requireAcknowledgement?: boolean;
}

/**
 * The only place in the app that displays plaintext recovery codes.
 *
 * The plaintext exists on the server for exactly one response, so the panel
 * deliberately offers every way to take a copy (copy, download, print) and
 * makes the acknowledgement checkbox the gate before the codes disappear.
 */
export function BackupCodesPanel({
  codes,
  username,
  onDone,
  doneLabel = "I have saved my codes",
  requireAcknowledgement = true,
}: BackupCodesPanelProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  function markSaved() {
    setSaved(true);
  }

  function copyCodes() {
    void navigator.clipboard
      .writeText(codes.join("\n"))
      .then(() => {
        setCopied(true);
        markSaved();
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard permission denied — the download button still works.
      });
  }

  function downloadCodes() {
    const lines = [
      "MOKA CAFE — two-factor recovery codes",
      `Account: ${username ?? "unknown"}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "Each code can be used once. Keep this file somewhere private and offline.",
      "If you lose your authenticator, one of these codes is your way back in.",
      "",
      ...codes.map((code, index) => `${index + 1}. ${code}`),
      "",
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `moka-recovery-codes-${username ?? "account"}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking synchronously can abort the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    markSaved();
  }

  function printCodes() {
    const printWindow = window.open("", "_blank", "width=640,height=720");
    if (!printWindow) {
      // Popup blocked — the download is the same content.
      downloadCodes();
      return;
    }

    const doc = printWindow.document;
    doc.title = "MOKA CAFE recovery codes";

    const style = doc.createElement("style");
    style.textContent = `
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 40px; color: #111; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      p { font-size: 12px; color: #444; line-height: 1.5; }
      ol { margin: 24px 0 0; padding-left: 28px; font-family: ui-monospace, monospace; font-size: 16px; line-height: 2; }
      .warning { margin-top: 24px; padding: 12px; border: 1px solid #d9a441; background: #fff8e6; font-size: 12px; }
    `;
    doc.head.appendChild(style);

    const heading = doc.createElement("h1");
    heading.textContent = "MOKA CAFE — two-factor recovery codes";
    doc.body.appendChild(heading);

    const account = doc.createElement("p");
    account.textContent = `Account: ${username ?? "unknown"} · Generated: ${new Date().toLocaleString()}`;
    doc.body.appendChild(account);

    const list = doc.createElement("ol");
    for (const code of codes) {
      const item = doc.createElement("li");
      item.textContent = code;
      list.appendChild(item);
    }
    doc.body.appendChild(list);

    const warning = doc.createElement("p");
    warning.className = "warning";
    warning.textContent =
      "Each code works once. Keep this page somewhere private. If you lose your authenticator, one of these codes is your way back in.";
    doc.body.appendChild(warning);

    doc.close();
    printWindow.focus();
    printWindow.print();
    markSaved();
  }

  const continueDisabled = requireAcknowledgement && !acknowledged;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
          {codes.map((code) => (
            <div
              key={code}
              className="rounded-lg border bg-background px-3 py-1.5 text-center font-semibold tracking-wider text-foreground"
            >
              {code}
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button type="button" variant="outline" size="sm" onClick={copyCodes}>
            {copied ? (
              <>
                <Check className="mr-1.5 size-3.5 text-success" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 size-3.5" />
                Copy all
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadCodes}
          >
            <Download className="mr-1.5 size-3.5" />
            Download .txt
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={printCodes}
          >
            <Printer className="mr-1.5 size-3.5" />
            Print
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-warning"
          aria-hidden
        />
        <p className="text-xs leading-relaxed text-warning">
          These codes are shown{" "}
          <strong>once</strong>. If you leave this screen without saving them,
          you will need another admin — or the server operator — to reset your
          two-factor authentication.
        </p>
      </div>

      {requireAcknowledgement ? (
        <div className="flex items-start gap-2.5 rounded-lg border bg-card px-3 py-3">
          <Checkbox
            id="backup-codes-saved"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
            className="mt-0.5"
          />
          <Label
            htmlFor="backup-codes-saved"
            className="text-xs font-normal leading-relaxed text-muted-foreground"
          >
            I have saved these codes somewhere safe. I understand they will not
            be shown again.
            {saved ? (
              <span className="ml-1 inline-flex items-center gap-1 font-medium text-success">
                <ShieldCheck className="size-3" aria-hidden />
                Copy saved
              </span>
            ) : null}
          </Label>
        </div>
      ) : null}

      <Button
        type="button"
        className="w-full"
        size="lg"
        onClick={onDone}
        disabled={continueDisabled}
      >
        {doneLabel}
      </Button>
    </div>
  );
}
