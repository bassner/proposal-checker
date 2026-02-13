"use client";

import { useState, useCallback } from "react";
import { Loader2, Plus, Trash2, Check, AlertCircle, Eye, EyeOff } from "lucide-react";

const WEBHOOK_EVENTS = [
  "review.completed",
  "review.failed",
  "annotation.updated",
] as const;

type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

interface Props {
  initialWebhooks: Webhook[];
}

export function WebhooksManager({ initialWebhooks }: Props) {
  const [webhooks, setWebhooks] = useState<Webhook[]>(initialWebhooks);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());

  // New webhook form state
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newEvents, setNewEvents] = useState<Set<WebhookEvent>>(new Set(WEBHOOK_EVENTS));

  const clearError = useCallback(() => {
    setTimeout(() => setError(null), 5000);
  }, []);

  const toggleSecretVisibility = (id: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newUrl || !newSecret || newEvents.size === 0) {
      setError("URL, secret, and at least one event are required");
      clearError();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl,
          events: Array.from(newEvents),
          secret: newSecret,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create webhook");
      }
      const { webhook } = await res.json();
      setWebhooks((prev) => [webhook, ...prev]);
      setNewUrl("");
      setNewSecret("");
      setNewEvents(new Set(WEBHOOK_EVENTS));
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      clearError();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (wh: Webhook) => {
    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: wh.id, active: !wh.active }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update");
      }
      const { webhook } = await res.json();
      setWebhooks((prev) => prev.map((w) => (w.id === webhook.id ? webhook : w)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      clearError();
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/webhooks?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to delete");
      }
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      clearError();
    }
  };

  const toggleEvent = (event: WebhookEvent) => {
    setNewEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        if (next.size > 1) next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  };

  return (
    <div>
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Webhook list */}
      {webhooks.length === 0 && !showForm && (
        <p className="mb-4 text-xs text-white/40">No webhooks configured.</p>
      )}

      {webhooks.length > 0 && (
        <div className="mb-4 space-y-3">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      wh.active ? "bg-green-400" : "bg-white/20"
                    }`}
                  />
                  <span className="truncate text-sm text-white/80">{wh.url}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {wh.events.map((e) => (
                    <span
                      key={e}
                      className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400"
                    >
                      {e}
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/30">
                  <span>Secret:</span>
                  <code className="font-mono">
                    {visibleSecrets.has(wh.id)
                      ? wh.secret
                      : "\u2022".repeat(Math.min(wh.secret.length, 16))}
                  </code>
                  <button
                    onClick={() => toggleSecretVisibility(wh.id)}
                    className="text-white/30 hover:text-white/60"
                  >
                    {visibleSecrets.has(wh.id) ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => handleToggleActive(wh)}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    wh.active
                      ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      : "bg-white/5 text-white/40 hover:bg-white/10"
                  }`}
                >
                  {wh.active ? "Active" : "Inactive"}
                </button>
                <button
                  onClick={() => handleDelete(wh.id)}
                  className="rounded-md p-1 text-red-400/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add webhook form */}
      {showForm ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="mb-3">
            <label className="mb-1 block text-xs text-white/50">URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-white/50">Secret (for HMAC signature)</label>
            <input
              type="text"
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder="min 8 characters"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-xs text-white/50">Events</label>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={newEvents.has(event)}
                    onChange={() => toggleEvent(event)}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 text-blue-500"
                  />
                  <span className="text-xs text-white/60">{event}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Create
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-md px-3 py-1.5 text-xs text-white/40 transition-colors hover:text-white/60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-white/10 px-3 py-1.5 text-xs text-white/40 transition-colors hover:border-white/20 hover:text-white/60"
        >
          <Plus className="h-3 w-3" />
          Add Webhook
        </button>
      )}
    </div>
  );
}
