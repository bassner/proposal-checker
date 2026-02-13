"use client";

import { useState, useRef, useEffect } from "react";
import type { Finding, Severity, AnnotationStatus, AnnotationEntry, Comment } from "@/types/review";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check, X, Wrench, MessageSquare, Send, Trash2, AlertOctagon, AlertTriangle, AlertCircle, Lightbulb, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { COMMENT_TEMPLATES } from "@/lib/comment-templates";

interface FeedbackCardProps {
  finding: Finding;
  annotation?: AnnotationEntry;
  onAnnotate?: (status: AnnotationStatus) => void;
  focused?: boolean;
  onAddComment?: (text: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  commentSubmitting?: boolean;
  /** Called when a page reference in the finding is clicked (for PDF viewer navigation). */
  onPageClick?: (page: number) => void;
}

const severityConfig: Record<
  Severity,
  { borderColor: string; icon: LucideIcon; iconColor: string }
> = {
  critical: { borderColor: "border-l-red-500", icon: AlertOctagon, iconColor: "text-red-400" },
  major: { borderColor: "border-l-orange-500", icon: AlertTriangle, iconColor: "text-orange-400" },
  minor: { borderColor: "border-l-yellow-500", icon: AlertCircle, iconColor: "text-yellow-400" },
  suggestion: { borderColor: "border-l-blue-500", icon: Lightbulb, iconColor: "text-blue-400" },
};

const annotationButtons: { status: AnnotationStatus; icon: typeof Check; label: string }[] = [
  { status: "accepted", icon: Check, label: "Accept" },
  { status: "dismissed", icon: X, label: "Dismiss" },
  { status: "fixed", icon: Wrench, label: "Fixed" },
];

function renderQuoteWithBold(quote: string): ReactNode {
  const parts = quote.split("**");
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-white/70">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function CommentItem({ comment, onDelete }: { comment: Comment; onDelete?: (id: string) => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="group flex gap-2 rounded-md bg-white/[0.03] px-2.5 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-purple-300/80">{comment.authorName}</span>
          <span className="text-[9px] text-white/20">{formatCommentDate(comment.createdAt)}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-white/60 whitespace-pre-wrap break-words">
          {comment.text}
        </p>
      </div>
      {onDelete && (
        <button
          type="button"
          disabled={deleting}
          onClick={async () => {
            setDeleting(true);
            try { await onDelete(comment.id); } finally { setDeleting(false); }
          }}
          className="no-print shrink-0 self-start opacity-0 group-hover:opacity-100 transition-opacity text-white/20 hover:text-red-400"
          aria-label="Delete comment"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function CommentForm({ onSubmit, submitting }: { onSubmit: (text: string) => Promise<void>; submitting?: boolean }) {
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
    // Focus the textarea after inserting
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <div className="no-print flex items-start gap-1.5">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add supervisor comment..."
        rows={1}
        className="flex-1 resize-none rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 focus:border-purple-500/40 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
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
          className="w-64 max-h-72 overflow-y-auto border-white/10 bg-slate-900 p-2"
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
        className="shrink-0 rounded-md bg-purple-500/20 p-1.5 text-purple-300 transition-colors hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Submit comment"
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function FeedbackCard({ finding, annotation, onAnnotate, focused, onAddComment, onDeleteComment, commentSubmitting, onPageClick }: FeedbackCardProps) {
  const config = severityConfig[finding.severity];
  const SevIcon = config.icon;
  const [locationsExpanded, setLocationsExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focused && cardRef.current) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      cardRef.current.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "nearest" });
    }
  }, [focused]);

  const sortedLocations = [...finding.locations].sort((a, b) => {
    const pa = a.page ?? Infinity;
    const pb = b.page ?? Infinity;
    return pa - pb;
  });

  const visibleLocations = locationsExpanded ? sortedLocations : sortedLocations.slice(0, 4);
  const hiddenCount = sortedLocations.length - 4;

  const isDismissed = annotation?.status === "dismissed";
  const isFixed = annotation?.status === "fixed";
  const comments = annotation?.comments ?? [];
  const commentCount = comments.length;

  return (
    <div
      ref={cardRef}
      className={cn(
        "print-card rounded-lg border border-white/10 border-l-4 bg-white/5 p-3 backdrop-blur-sm transition-all hover:bg-white/[0.07]",
        // Default severity border, overridden by annotation state
        !annotation?.status && config.borderColor,
        isFixed && "border-l-emerald-500 bg-emerald-500/5",
        isDismissed && "border-l-white/20 opacity-50",
        focused && "ring-2 ring-blue-500/60 bg-white/[0.09]",
      )}
    >
      <div className="space-y-1.5">
        <div className="flex items-start gap-1.5">
          <SevIcon
            className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", config.iconColor, isDismissed && "opacity-40")}
            aria-label={finding.severity}
          />
          <p className={cn(
            "flex-1 text-xs font-medium leading-snug text-white/90",
            isDismissed && "line-through text-white/40"
          )}>
            {finding.title}
          </p>
          {commentCount > 0 && (
            <span className="no-print flex shrink-0 items-center gap-0.5 rounded-full bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-medium text-purple-300/80">
              <MessageSquare className="h-2.5 w-2.5" />
              {commentCount}
            </span>
          )}
        </div>
        <p className={cn(
          "text-xs leading-relaxed text-white/50",
          isDismissed && "text-white/25"
        )}>
          {finding.description}
        </p>
        {sortedLocations.length > 0 && (
          <div className="space-y-1 pt-1">
            {visibleLocations.map((loc, i) => (
              <div key={i} className="text-[11px] leading-snug text-white/35">
                <span className="font-medium text-white/45">
                  {loc.page != null && onPageClick ? (
                    <button
                      type="button"
                      onClick={() => onPageClick(loc.page!)}
                      className="text-blue-400/70 hover:text-blue-300 underline decoration-blue-400/30 hover:decoration-blue-300/50 transition-colors"
                      aria-label={`Go to page ${loc.page}`}
                    >
                      p.&nbsp;{loc.page}
                    </button>
                  ) : loc.page != null ? (
                    `p.\u00A0${loc.page}`
                  ) : null}
                  {loc.page != null && loc.section && " \u00B7 "}
                  {loc.section}
                  {loc.page == null && !loc.section && "\u2014"}
                </span>
                {" "}
                <span className="italic">
                  &ldquo;{renderQuoteWithBold(loc.quote)}&rdquo;
                </span>
              </div>
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
                onClick={() => setLocationsExpanded((e) => !e)}
                aria-expanded={locationsExpanded}
                aria-label={locationsExpanded ? "Show fewer source locations" : `Show ${hiddenCount} more source location${hiddenCount === 1 ? "" : "s"}`}
              >
                {locationsExpanded
                  ? "show less"
                  : `+${hiddenCount} more source${hiddenCount === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        )}

        {/* Annotation action buttons */}
        {onAnnotate && (
          <div className="no-print flex items-center gap-1 pt-1.5">
            {annotationButtons.map(({ status, icon: Icon, label }) => {
              const isActive = annotation?.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-label={isActive ? `Remove ${label.toLowerCase()} mark` : `Mark as ${label.toLowerCase()}`}
                  aria-pressed={isActive}
                  onClick={() => onAnnotate(status)}
                  className={cn(
                    "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                    isActive
                      ? status === "accepted"
                        ? "bg-blue-500/20 text-blue-300"
                        : status === "dismissed"
                          ? "bg-white/10 text-white/50"
                          : "bg-emerald-500/20 text-emerald-300"
                      : "text-white/25 hover:text-white/50 hover:bg-white/5"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Supervisor comments */}
        {commentCount > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-white/5">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onDelete={onDeleteComment}
              />
            ))}
          </div>
        )}

        {/* Comment form for supervisors */}
        {onAddComment && (
          <div className="pt-1.5">
            <CommentForm onSubmit={onAddComment} submitting={commentSubmitting} />
          </div>
        )}
      </div>
    </div>
  );
}
