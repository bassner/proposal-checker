import { requireAuth } from "@/lib/auth/helpers";
import { isAvailable, getReviewById, getReviewNotes, upsertReviewNote, deleteReviewNote, logAuditEvent } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTE_LENGTH = 10000;

/**
 * GET /api/review/[id]/notes — List all notes for a review.
 * Requires auth. Any authenticated user with access to the review can read notes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  // Access check: owner, admin, or phd can see notes
  const role = session.user.role;
  if (review.userId !== session.user.id && role !== "admin" && role !== "phd") {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  const notes = await getReviewNotes(id);
  return Response.json({ notes });
}

/**
 * POST /api/review/[id]/notes — Create or update the current user's note.
 * Body: { content: string }
 * Only admin/phd roles can write notes.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const role = session.user.role;
  if (role !== "admin" && role !== "phd") {
    return Response.json({ error: "Forbidden: insufficient role" }, { status: 403 });
  }

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  const review = await getReviewById(id);
  if (!review) {
    return Response.json({ error: "Review not found" }, { status: 404 });
  }

  let body: { content?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length > MAX_NOTE_LENGTH) {
    return Response.json(
      { error: `Note must be at most ${MAX_NOTE_LENGTH} characters` },
      { status: 400 }
    );
  }

  // Empty content means "delete my note"
  if (!content) {
    // Find and delete the user's note for this review
    const notes = await getReviewNotes(id);
    const myNote = notes.find((n) => n.userId === session.user.id);
    if (myNote) {
      await deleteReviewNote(myNote.id, session.user.id!);
      logAuditEvent(id, session.user.id, session.user.email ?? null, "note.deleted", {});
    }
    const updatedNotes = await getReviewNotes(id);
    return Response.json({ ok: true, notes: updatedNotes });
  }

  const note = await upsertReviewNote(
    id,
    session.user.id!,
    session.user.name ?? "Unknown",
    content
  );

  logAuditEvent(id, session.user.id, session.user.email ?? null, "note.saved", {
    noteId: note.id,
  });

  const updatedNotes = await getReviewNotes(id);
  return Response.json({ ok: true, notes: updatedNotes });
}

/**
 * DELETE /api/review/[id]/notes — Delete a note.
 * Body: { noteId: string }
 * Admin can delete any note. PHD can only delete their own.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let session;
  try {
    session = await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const role = session.user.role;
  if (role !== "admin" && role !== "phd") {
    return Response.json({ error: "Forbidden: insufficient role" }, { status: 403 });
  }

  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid review ID" }, { status: 400 });
  }

  if (!(await isAvailable())) {
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }

  let body: { noteId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const noteId = typeof body.noteId === "string" ? body.noteId : "";
  if (!noteId || !UUID_RE.test(noteId)) {
    return Response.json({ error: "Invalid noteId" }, { status: 400 });
  }

  // For admin: allow deleting any note by fetching it first
  if (role === "admin") {
    const notes = await getReviewNotes(id);
    const note = notes.find((n) => n.id === noteId);
    if (!note) {
      return Response.json({ error: "Note not found" }, { status: 404 });
    }
    // Admin deletes by the note owner's userId
    await deleteReviewNote(noteId, note.userId);
  } else {
    // PHD can only delete own notes
    const deleted = await deleteReviewNote(noteId, session.user.id!);
    if (!deleted) {
      return Response.json({ error: "Note not found or not owned by you" }, { status: 404 });
    }
  }

  logAuditEvent(id, session.user.id, session.user.email ?? null, "note.deleted", {
    noteId,
  });

  const updatedNotes = await getReviewNotes(id);
  return Response.json({ ok: true, notes: updatedNotes });
}
