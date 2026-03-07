"use client";

import { useState } from "react";
import { AlertTriangle, Download, Trash2, Loader2 } from "lucide-react";

export function GdprActions({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  if (!isAuthenticated) {
    return (
      <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h3 className="text-sm font-medium text-amber-300">
              Datenauskunft &amp; Löschung
            </h3>
            <p className="mt-1 text-sm text-amber-200/70">
              Um Ihre Daten einzusehen oder zu löschen, melden Sie sich bitte
              zuerst an und kehren Sie dann auf diese Seite zurück.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Export fehlgeschlagen");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposal-checker-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Datenexport fehlgeschlagen. Bitte versuchen Sie es erneut.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== "LÖSCHEN") return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Löschung fehlgeschlagen");
      // Redirect to sign-out (clears session cookie)
      window.location.href = "/api/auth/signout?callbackUrl=/privacy";
    } catch {
      setError("Datenlöschung fehlgeschlagen. Bitte versuchen Sie es erneut.");
      setDeleting(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="w-full">
          <h3 className="text-sm font-medium text-amber-300">
            Ihre Rechte ausüben
          </h3>
          <p className="mt-1 text-sm text-amber-200/70">
            Sie können alle zu Ihrer Person gespeicherten Daten herunterladen
            oder unwiderruflich löschen lassen.
          </p>

          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Alle meine Daten exportieren
            </button>
          </div>

          <div className="mt-4 border-t border-amber-500/20 pt-4">
            <p className="text-xs text-amber-200/60">
              Die Löschung entfernt <strong className="text-amber-200/80">unwiderruflich</strong> alle
              Ihre Daten: Reviews, hochgeladene PDFs, Annotationen, Kommentare,
              Audit-Einträge und Ihr Benutzerkonto. Geben
              Sie <strong className="text-amber-200/80">LÖSCHEN</strong> ein,
              um zu bestätigen.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="LÖSCHEN"
                className="w-24 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder:text-white/20 focus:border-red-500/50 focus:outline-none"
              />
              <button
                onClick={handleDelete}
                disabled={deleting || confirmText !== "LÖSCHEN"}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Alle meine Daten löschen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
