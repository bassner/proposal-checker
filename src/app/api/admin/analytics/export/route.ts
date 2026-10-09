import { requireRole } from "@/lib/auth/helpers";
import { isAvailable, getAnalyticsForDateRange } from "@/lib/db";
import { toCsv, computeTotals } from "@/lib/analytics-export";

export async function GET(request: Request) {
  try {
    await requireRole("admin");
  } catch (response) {
    return response as Response;
  }

  if (!(await isAvailable())) {
    return Response.json(
      { error: "Database unavailable" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";
  const startDate = searchParams.get("startDate") ?? undefined;
  const endDate = searchParams.get("endDate") ?? undefined;

  if (format !== "csv" && format !== "json") {
    return Response.json(
      { error: "Invalid format — must be 'csv' or 'json'" },
      { status: 400 }
    );
  }

  // Basic date validation
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && !dateRegex.test(startDate)) {
    return Response.json(
      { error: "Invalid startDate — expected YYYY-MM-DD" },
      { status: 400 }
    );
  }
  if (endDate && !dateRegex.test(endDate)) {
    return Response.json(
      { error: "Invalid endDate — expected YYYY-MM-DD" },
      { status: 400 }
    );
  }

  try {
    const rows = await getAnalyticsForDateRange(startDate, endDate);
    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      const csv = toCsv(rows);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="analytics-${timestamp}.csv"`,
        },
      });
    }

    // JSON format: metadata and totals plus the full per-review rows
    const body = {
      exportedAt: new Date().toISOString(),
      filters: { startDate: startDate ?? null, endDate: endDate ?? null },
      totals: computeTotals(rows),
      reviews: rows,
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="analytics-${timestamp}.json"`,
      },
    });
  } catch (err) {
    console.error("[api] Failed to export analytics:", err);
    return Response.json(
      { error: "Failed to export analytics" },
      { status: 500 }
    );
  }
}
