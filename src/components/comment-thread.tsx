"use client";

import { useState, useRef } from "react";
import type { Comment } from "@/types/review";
import { cn } from "@/lib/utils";
import { Reply, CheckCircle2, RotateCcw, Trash2, Send, FileText } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { COMMENT_TEMPLATES } from "@/lib/comment-templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentThreadProps {
  /** Top-level comment for this thread. */
  comment: Comment;
  /** Replies to this comment (already sorted by createdAt). */
  replies: Comment[];
  /** Whether the current user can resolve/reply (admin or phd). */
  canManage?: boolean;
  /** Submit a reply to this thread. */
  onReply?: (parentId: string, text: string) => Promise<void>;
  /** Delete a comment by ID. */
  onDelete?: (commentId: string) => Promise<void>;
  /** Resolve or reopen this thread. */
  onResolve?: (commentId: string, status: "resolved" | "open") => Promise<void>;
  /** Whether a reply is currently being submitted. */
  submitting?: boolean;
}

interface ThreadSummaryProps {
  comments: Comment[];
  /** Total number of threads (top-level comments). */
  threadCount: number;
  /** Number of unresolved threads. */
  unresolvedCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

// ---------------------------------------------------------------------------
// Single comment row
// ---------------------------------------------------------------------------

function CommentRow({
  comment,
  isReply,
  onDelete,
}: {
  comment: Comment;
  isReply?: boolean;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div
      className={cn(
        "group flex gap-2 rounded-md px-2.5 py-2",
        isReply
          ? "bg-slate-100/60 dark:bg-white/[0.02]"
          : "bg-slate-50 dark:bg-white/[0.03]"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-purple-600 dark:text-purple-300/80">
            {comment.authorName}
          </span>
          <span className="text-[9px] text-slate-400 dark:text-white/20">
            {formatCommentDate(comment.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-600 dark:text-white/60">
          {comment.text}
        </p>
      </div>
      {onDelete && (
        <button
          type="button"
          disabled={deleting}
          onClick={async () => {
            setDeleting(true);
            try {
              await onDelete(comment.id);
            } finally {
              setDeleting(false);
            }
          }}
          className="no-print shrink-0 self-start opacity-0 transition-opacity group-hover:opacity-100 text-slate-400 hover:text-red-500 dark:text-white/20 dark:hover:text-red-400"
          aria-label="Delete comment"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline reply form
// ---------------------------------------------------------------------------

function ReplyForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const [text, setText] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    await onSubmit(trimmed);
    setText("");
  };

  const insertTemplate = (templateText: string) => {
    setText((prev) => {
      if (!prev.trim()) return templateText;
      return prev.trimEnd() + " " + templateText;
    });
    setTemplateOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <div className="no-print flex items-start gap-1.5 pl-3">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply..."
        rows={1}
        autoFocus
        className="flex-1 resize-none rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:placeholder:text-white/20 dark:focus:border-purple-500/40"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === "Escape") {
            onCancel();
          }
        }}
      />
      <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded-md bg-white/5 p-1.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/50"
            aria-label="Insert comment template"
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          className="max-h-72 w-64 overflow-y-auto border-white/10 bg-slate-900 p-2"
        >
          <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-white/30">
            Templates
          </p>
          {COMMENT_TEMPLATES.map((cat) => (
            <div key={cat.category} className="mb-1">
              <p className="px-1 py-1 text-[10px] font-semibold text-white/50">
                {cat.category}
              </p>
              {cat.templates.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => insertTemplate(tpl.text)}
                  className="w-full rounded px-2 py-1 text-left text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          ))}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        disabled={!text.trim() || submitting}
        onClick={handleSubmit}
        className="shrink-0 rounded-md bg-purple-100 p-1.5 text-purple-600 transition-colors hover:bg-purple-200 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-purple-500/20 dark:text-purple-300 dark:hover:bg-purple-500/30"
        aria-label="Submit reply"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread component
// ---------------------------------------------------------------------------

export function CommentThread({
  comment,
  replies,
  canManage,
  onReply,
  onDelete,
  onResolve,
  submitting,
}: CommentThreadProps) {
  const [replying, setReplying] = useState(false);
  const [resolving, setResolving] = useState(false);

  const isResolved = comment.threadStatus === "resolved";
  const replyCount = replies.length;

  const handleResolve = async () => {
    if (!onResolve || resolving) return;
    setResolving(true);
    try {
      await onResolve(comment.id, isResolved ? "open" : "resolved");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border-l-2 transition-colors",
        isResolved
          ? "border-l-emerald-500 bg-emerald-500/[0.03]"
          : "border-l-purple-400/40 bg-transparent"
      )}
    >
      {/* Thread header with resolved badge */}
      {isResolved && (
        <div className="flex items-center gap-1.5 px-2.5 pt-2">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400/80">
            Resolved
          </span>
          {comment.resolvedByName && (
            <span className="text-[9px] text-slate-400 dark:text-white/20">
              by {comment.resolvedByName}
              {comment.resolvedAt && ` \u00B7 ${formatCommentDate(comment.resolvedAt)}`}
            </span>
          )}
        </div>
      )}

      {/* Top-level comment */}
      <div className="px-1 pt-1">
        <CommentRow comment={comment} onDelete={onDelete} />
      </div>

      {/* Replies */}
      {replyCount > 0 && (
        <div className="ml-4 space-y-1 border-l border-slate-200 pl-2 dark:border-white/10">
          {replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              isReply
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Action buttons */}
      {canManage && (
        <div className="no-print flex items-center gap-2 px-2.5 pb-2 pt-1.5">
          {onReply && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                replying
                  ? "bg-purple-500/15 text-purple-400"
                  : "text-slate-400 hover:text-slate-600 dark:text-white/25 dark:hover:text-white/50"
              )}
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
          )}
          {onResolve && (
            <button
              type="button"
              disabled={resolving}
              onClick={handleResolve}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50",
                isResolved
                  ? "text-amber-500 hover:text-amber-600 dark:text-amber-400/80 dark:hover:text-amber-300"
                  : "text-emerald-500 hover:text-emerald-600 dark:text-emerald-400/80 dark:hover:text-emerald-300"
              )}
            >
              {isResolved ? (
                <>
                  <RotateCcw className="h-3 w-3" />
                  Reopen
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Resolve
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Inline reply form */}
      {replying && onReply && (
        <div className="px-1 pb-2">
          <ReplyForm
            onSubmit={async (text) => {
              await onReply(comment.id, text);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
            submitting={submitting}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread summary (shows thread count and unresolved count)
// ---------------------------------------------------------------------------

export function ThreadSummary({ threadCount, unresolvedCount }: ThreadSummaryProps) {
  if (threadCount === 0) return null;

  return (
    <span className="no-print inline-flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-white/30">
      {threadCount} thread{threadCount !== 1 ? "s" : ""}
      {unresolvedCount > 0 && (
        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-500 dark:text-amber-400/80">
          {unresolvedCount} unresolved
        </span>
      )}
    </span>
  );
}
