import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAllowedProviders } from "@/lib/auth/provider-access";
import { getAnalytics, getFailedReviews, getCheckGroupMetrics, getReviewTemplates, listWebhooks, getSeverityWeights, listPromptSnippets, getCheckGroupOrder, listFindingPatterns, getFindingImpactMatrix } from "@/lib/db";
import { APP_ROLES, ROLE_HIERARCHY } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import type { ProviderType } from "@/types/review";
import { Shield, ArrowLeft, ClipboardList, AlertTriangle, XCircle, FileStack, Webhook, Activity, Gauge, Download, Puzzle, ListOrdered, Repeat, CalendarDays, Users2, Grid3x3 } from "lucide-react";
import Link from "next/link";
import { RoleConfigEditor } from "@/components/admin/role-config-editor";
import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { FailedReviewsDashboard } from "@/components/admin/failed-reviews-dashboard";
import { ReviewTemplatesEditor } from "@/components/admin/review-templates-editor";
import { WebhooksManager } from "@/components/admin/webhooks-manager";
import { CheckMetricsDashboard } from "@/components/admin/check-metrics-dashboard";
import { SeverityConfigEditor } from "@/components/admin/severity-config-editor";
import { AnalyticsExport } from "@/components/admin/analytics-export";
import { PromptSnippetsEditor } from "@/components/admin/prompt-snippets-editor";
import { CheckGroupOrderEditor } from "@/components/admin/check-group-order-editor";
import { FindingPatternsDashboard } from "@/components/admin/finding-patterns-dashboard";
import { DeadlineCalendar } from "@/components/admin/deadline-calendar";
import { DeadlineRiskSummary } from "@/components/admin/deadline-risk-summary";
import { PeerPairingDashboard } from "@/components/admin/peer-pairing-dashboard";
import { ImpactMatrixDashboard } from "@/components/admin/impact-matrix-dashboard";

export default async function AdminPage() {
  const session = await auth();
  if (
    !session?.user?.role ||
    ROLE_HIERARCHY[session.user.role] < ROLE_HIERARCHY["admin"]
  ) {
    redirect("/");
  }

  // Load config + analytics + failed reviews + check metrics + templates + webhooks + severity weights + snippets + check group order + finding patterns + impact matrix from DB in parallel
  const [configResults, analyticsData, failedReviewsData, checkMetricsData, templatesData, webhooksData, severityWeightsData, snippetsData, checkGroupOrderData, findingPatternsData, impactMatrixData] = await Promise.all([
    Promise.all(
      APP_ROLES.map(async (role) => ({
        role,
        result: await getAllowedProviders(role),
      }))
    ),
    getAnalytics().catch((err) => {
      console.error("[admin] Failed to load analytics:", err);
      return null;
    }),
    getFailedReviews().catch((err) => {
      console.error("[admin] Failed to load failed reviews:", err);
      return null;
    }),
    getCheckGroupMetrics().catch((err) => {
      console.error("[admin] Failed to load check metrics:", err);
      return null;
    }),
    getReviewTemplates().catch((err) => {
      console.error("[admin] Failed to load review templates:", err);
      return [];
    }),
    listWebhooks().catch((err) => {
      console.error("[admin] Failed to load webhooks:", err);
      return [];
    }),
    getSeverityWeights().catch((err) => {
      console.error("[admin] Failed to load severity weights:", err);
      return [];
    }),
    listPromptSnippets().catch((err) => {
      console.error("[admin] Failed to load prompt snippets:", err);
      return [];
    }),
    getCheckGroupOrder().catch((err) => {
      console.error("[admin] Failed to load check group order:", err);
      return [];
    }),
    listFindingPatterns().catch((err) => {
      console.error("[admin] Failed to load finding patterns:", err);
      return [];
    }),
    getFindingImpactMatrix().catch((err) => {
      console.error("[admin] Failed to load impact matrix:", err);
      return null;
    }),
  ]);

  const configUnavailable = configResults.some(
    ({ result }) => result.status === "unavailable"
  );

  const configMap = Object.fromEntries(
    configResults.map(({ role, result }) => [role, result.providers])
  ) as Record<AppRole, ProviderType[]>;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 backdrop-blur-sm">
              <Shield className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Admin Panel</h1>
              <p className="text-xs text-white/40">Analytics &amp; configuration</p>
            </div>
          </div>
          <nav aria-label="Page navigation">
            <Link
              href="/"
              aria-label="Back to Home"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>
          </nav>
        </header>

        <main id="main-content">
        {/* Analytics Dashboard */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <h2 className="mb-4 text-sm font-medium text-white/60">Review Analytics</h2>
          <AnalyticsDashboard initialData={analyticsData} />

          {/* Export panel */}
          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="mb-3 flex items-center gap-2">
              <Download className="h-4 w-4 text-blue-400" />
              <h3 className="text-xs font-medium text-white/40">Export Analytics Data</h3>
            </div>
            <AnalyticsExport />
          </div>
        </div>

        {/* Deadline Calendar & Risk Analysis */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Submission Deadline Calendar</h2>
          </div>
          <DeadlineCalendar />

          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h3 className="text-xs font-medium text-white/40">Risk Analysis</h3>
            </div>
            <DeadlineRiskSummary />
          </div>
        </div>

        {/* Failed Reviews */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-medium text-white/60">Failed Reviews</h2>
          </div>
          <FailedReviewsDashboard initialData={failedReviewsData} />
        </div>

        {/* Check Group Performance */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Check Group Performance</h2>
          </div>
          <CheckMetricsDashboard initialData={checkMetricsData} />
        </div>

        {/* Finding Patterns */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Repeat className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Recurring Finding Patterns</h2>
          </div>
          <FindingPatternsDashboard initialPatterns={findingPatternsData} />
        </div>

        {/* Finding Impact Matrix */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Grid3x3 className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Finding Impact Matrix</h2>
          </div>
          <ImpactMatrixDashboard initialData={impactMatrixData} />
        </div>

        {/* Role-Provider Mapping */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <h2 className="mb-4 text-sm font-medium text-white/60">Role-Provider Mapping</h2>
          {configUnavailable && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Provider configuration could not be loaded from the database. Changes may not be saved.
            </div>
          )}
          <RoleConfigEditor initialConfig={configMap} />
        </div>

        {/* Severity Weights */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Severity Weights &amp; Scoring</h2>
          </div>
          <SeverityConfigEditor initialWeights={severityWeightsData} />
        </div>

        {/* Check Group Display Order */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Check Group Display Order</h2>
          </div>
          <CheckGroupOrderEditor initialOrder={checkGroupOrderData} />
        </div>

        {/* Review Templates */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <FileStack className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Review Templates</h2>
          </div>
          <ReviewTemplatesEditor initialTemplates={templatesData} />
        </div>

        {/* Prompt Snippets */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Prompt Snippets</h2>
          </div>
          <PromptSnippetsEditor initialSnippets={snippetsData} />
        </div>

        {/* Webhooks */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Webhook className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Webhooks</h2>
          </div>
          <WebhooksManager initialWebhooks={webhooksData} />
        </div>

        {/* Peer Review Pairings */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <Users2 className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-medium text-white/60">Peer Review Pairings</h2>
          </div>
          <PeerPairingDashboard />
        </div>

        {/* Reviews link */}
        <Link
          href="/reviews"
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-5 text-white/60 backdrop-blur-xl transition-colors hover:bg-white/10 hover:text-white"
        >
          <ClipboardList className="h-5 w-5" />
          <span className="text-sm font-medium">View all reviews &rarr;</span>
        </Link>
        </main>
      </div>
    </div>
  );
}
