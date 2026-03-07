"use client";

import { useState } from "react";
import { AlertTriangle, Download, Trash2, Loader2 } from "lucide-react";

type Lang = "de" | "en";

const t = {
  de: {
    unauthTitle: "Datenauskunft & Löschung",
    unauthDesc: "Um Ihre Daten einzusehen oder zu löschen, melden Sie sich bitte zuerst an und kehren Sie dann auf diese Seite zurück.",
    title: "Ihre Rechte ausüben",
    desc: "Sie können alle zu Ihrer Person gespeicherten Daten herunterladen oder unwiderruflich löschen lassen.",
    exportBtn: "Alle meine Daten exportieren",
    exportError: "Datenexport fehlgeschlagen. Bitte versuchen Sie es erneut.",
    deleteError: "Datenlöschung fehlgeschlagen. Bitte versuchen Sie es erneut.",
    deleteBtn: "Alle meine Daten löschen",
    confirmWord: "LÖSCHEN",
    deleteWarning: (
      <>
        Die Löschung entfernt <strong className="text-amber-200/80">unwiderruflich</strong> alle
        Ihre Daten aus der Datenbank: Reviews, Annotationen, Kommentare,
        Audit-Einträge und Ihr Benutzerkonto. Hochgeladene PDF-Dateien
        werden innerhalb von 24&nbsp;Stunden vom Server entfernt. Geben
        Sie <strong className="text-amber-200/80">LÖSCHEN</strong> ein,
        um zu bestätigen.
      </>
    ),
  },
  en: {
    unauthTitle: "Data Access & Deletion",
    unauthDesc: "To view or delete your data, please sign in first and then return to this page.",
    title: "Exercise Your Rights",
    desc: "You can download all data stored about you or have it irrevocably deleted.",
    exportBtn: "Export all my data",
    exportError: "Data export failed. Please try again.",
    deleteError: "Data deletion failed. Please try again.",
    deleteBtn: "Delete all my data",
    confirmWord: "DELETE",
    deleteWarning: (
      <>
        Deletion <strong className="text-amber-200/80">irrevocably</strong> removes
        all your data from the database: reviews, annotations, comments,
        audit entries, and your user account. Uploaded PDF files will be
        removed from the server within 24&nbsp;hours. Type{" "}
        <strong className="text-amber-200/80">DELETE</strong> to confirm.
      </>
    ),
  },
};

export function GdprActions({ isAuthenticated, lang = "de" }: { isAuthenticated: boolean; lang?: Lang }) {
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const s = t[lang];

  if (!isAuthenticated) {
    return (
      <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h3 className="text-sm font-medium text-amber-300">
              {s.unauthTitle}
            </h3>
            <p className="mt-1 text-sm text-amber-200/70">
              {s.unauthDesc}
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
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposal-checker-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(s.exportError);
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== s.confirmWord) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Deletion failed");
      }
      // Redirect to federated sign-out (clears Keycloak SSO session + cookies)
      window.location.href = "/api/auth/federated-signout";
    } catch {
      setError(s.deleteError);
      setDeleting(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="w-full">
          <h3 className="text-sm font-medium text-amber-300">
            {s.title}
          </h3>
          <p className="mt-1 text-sm text-amber-200/70">
            {s.desc}
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
              {s.exportBtn}
            </button>
          </div>

          <div className="mt-4 border-t border-amber-500/20 pt-4">
            <p className="text-xs text-amber-200/60">
              {s.deleteWarning}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={s.confirmWord}
                className="w-24 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder:text-white/20 focus:border-red-500/50 focus:outline-none"
              />
              <button
                onClick={handleDelete}
                disabled={deleting || confirmText !== s.confirmWord}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {s.deleteBtn}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
