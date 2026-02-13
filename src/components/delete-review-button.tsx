"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DeleteReviewButtonProps {
  reviewId: string;
  fileName?: string | null;
  /** "icon" renders only a trash icon (for table rows), "button" renders a labeled button */
  variant?: "icon" | "button";
  /** Where to redirect after deletion. Defaults to "/reviews". */
  redirectTo?: string;
  /** Called after successful deletion instead of redirecting */
  onDeleted?: () => void;
}

export function DeleteReviewButton({
  reviewId,
  fileName,
  variant = "button",
  redirectTo = "/reviews",
  onDeleted,
}: DeleteReviewButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${reviewId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to delete review");
        setDeleting(false);
        return;
      }
      setOpen(false);
      if (onDeleted) {
        onDeleted();
      } else {
        router.push(redirectTo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete review");
      setDeleting(false);
    }
  }, [reviewId, redirectTo, onDeleted, router]);

  const trigger =
    variant === "icon" ? (
      <AlertDialogTrigger asChild>
        <button
          className="rounded p-1 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
          title="Delete review"
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </AlertDialogTrigger>
    ) : (
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </AlertDialogTrigger>
    );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Review</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this review
            {fileName ? ` for "${fileName}"` : ""}? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-600/20"
          >
            {deleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
