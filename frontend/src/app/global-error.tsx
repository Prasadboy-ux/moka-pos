"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with a real reporter (Sentry, etc.) before production.
    console.error("Unhandled app error:", error);
  }, [error]);

  /**
   * `global-error` renders when the root layout itself fails, so it must ship
   * its own `<html>`/`<body>` — the app's layout, fonts, and providers are not
   * mounted here. Styling stays inline-safe (no globals beyond Tailwind's
   * reset), and the system font stack stands in for Inter for the same reason.
   */
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf9f7",
          fontFamily: "system-ui, sans-serif",
          color: "#1c1917",
        }}
      >
        <main
          style={{
            maxWidth: "26rem",
            textAlign: "center",
            padding: "4rem 1.5rem",
            border: "1px solid rgba(185, 28, 28, 0.25)",
            borderRadius: "1rem",
            background: "rgba(185, 28, 28, 0.04)",
          }}
        >
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              margin: "0 auto 1rem",
              borderRadius: "1rem",
              background: "rgba(185, 28, 28, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#b91c1c",
            }}
          >
            <AlertTriangle size={24} aria-hidden />
          </div>

          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", lineHeight: 1.6, color: "#57534e" }}>
            The app failed to start. The till is still counting sales on the
            backend; nothing is lost. Reload to try again.
          </p>

          {error.digest ? (
            <p
              style={{
                marginTop: "0.75rem",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#57534e",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #1c1917",
              background: "#1c1917",
              color: "#fafaf9",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <RotateCcw size={16} aria-hidden />
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
