import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { analyzeKeywordTrends } from "@/lib/trend-analysis";

type TrackingFrequency = "daily" | "weekly" | "manual";

type TrackedKeywordRow = {
  id: number;
  keyword_id: number;
  source_id: number;
  is_active: boolean;
  tracking_frequency: TrackingFrequency;
  last_collected_at: string | null;
  next_collection_at: string | null;
  created_at: string;
  updated_at: string;

  keywords:
    | {
        id: number;
        keyword: string;
        category: string | null;
      }
    | {
        id: number;
        keyword: string;
        category: string | null;
      }[]
    | null;

  market_sources:
    | {
        id: number;
        code: string;
        name: string;
      }
    | {
        id: number;
        code: string;
        name: string;
      }[]
    | null;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function calculateMarketplaceChange(
  latestCount: number | null | undefined,
  previousCount: number | null | undefined,
) {
  if (
    latestCount === null ||
    latestCount === undefined ||
    previousCount === null ||
    previousCount === undefined
  ) {
    return null;
  }

  return latestCount - previousCount;
}

function calculateAttentionScore(analysis: any) {
  if (!analysis?.has_meaningful_history || !analysis?.summary) {
    return 0;
  }

  const topMoverScore = Math.max(0, analysis.movers?.[0]?.signal?.score ?? 0);

  return Number(
    (
      (analysis.summary.surging_count ?? 0) * 20 +
      (analysis.summary.rising_count ?? 0) * 6 +
      topMoverScore * 0.5
    ).toFixed(3),
  );
}

async function analyzeInBatches(rows: TrackedKeywordRow[], batchSize = 4) {
  const results: Array<{
    tracked: TrackedKeywordRow;
    analysis: any;
  }> = [];

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (tracked) => ({
        tracked,
        analysis: await analyzeKeywordTrends(tracked.keyword_id),
      })),
    );

    results.push(...batchResults);
  }

  return results;
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("tracked_keywords")
      .select(
        `
          id,
          keyword_id,
          source_id,
          is_active,
          tracking_frequency,
          last_collected_at,
          next_collection_at,
          created_at,
          updated_at,

          keywords (
            id,
            keyword,
            category
          ),

          market_sources (
            id,
            code,
            name
          )
        `,
      )
      .eq("is_active", true)
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    const trackedRows = (data ?? []) as unknown as TrackedKeywordRow[];
    const analyzedRows = await analyzeInBatches(trackedRows);

    const markets = analyzedRows.map(({ tracked, analysis }) => {
      const keyword = firstRelation(tracked.keywords);
      const source = firstRelation(tracked.market_sources);

      if (analysis && "error" in analysis) {
        return {
          tracking_id: tracked.id,
          keyword_id: tracked.keyword_id,
          keyword: keyword?.keyword ?? "Unknown keyword",
          category: keyword?.category ?? null,
          source: source
            ? {
                id: source.id,
                code: source.code,
                name: source.name,
              }
            : null,
          tracking_frequency: tracked.tracking_frequency,
          last_collected_at: tracked.last_collected_at,
          next_collection_at: tracked.next_collection_at,
          status: "error",
          error: analysis.error,
          details: analysis.details ?? null,
        };
      }

      const latestRun = analysis.latest_run ?? null;
      const previousRun = analysis.previous_run ?? null;
      const summary = analysis.summary ?? null;
      const topMover = analysis.movers?.[0] ?? null;

      return {
        tracking_id: tracked.id,
        keyword_id: tracked.keyword_id,
        keyword:
          keyword?.keyword ?? analysis.keyword?.keyword ?? "Unknown keyword",
        category: keyword?.category ?? analysis.keyword?.category ?? null,

        source: source
          ? {
              id: source.id,
              code: source.code,
              name: source.name,
            }
          : null,

        tracking_frequency: tracked.tracking_frequency,
        last_collected_at: tracked.last_collected_at,
        next_collection_at: tracked.next_collection_at,

        status: "ok",

        has_history: analysis.has_history ?? false,
        has_meaningful_history: analysis.has_meaningful_history ?? false,
        history_status: analysis.history_status ?? "unknown",
        history_message: analysis.history_message ?? analysis.message ?? null,

        comparison_window: analysis.comparison_window ?? null,

        latest_run: latestRun,
        previous_run: previousRun,

        marketplace: {
          latest_result_count: latestRun?.total_result_count ?? null,
          previous_result_count: previousRun?.total_result_count ?? null,
          result_count_change: calculateMarketplaceChange(
            latestRun?.total_result_count,
            previousRun?.total_result_count,
          ),
        },

        coverage: analysis.coverage ?? null,

        signals: summary
          ? {
              collecting: summary.collecting_count ?? 0,
              surging: summary.surging_count ?? 0,
              rising: summary.rising_count ?? 0,
              steady: summary.steady_count ?? 0,
              cooling: summary.cooling_count ?? 0,
              declining: summary.declining_count ?? 0,
            }
          : null,

        movement: summary
          ? {
              median_view_change: summary.median_view_change ?? null,
              average_view_change: summary.average_view_change ?? null,
              median_favorite_change: summary.median_favorite_change ?? null,
              average_favorite_change: summary.average_favorite_change ?? null,
              median_rank_change: summary.median_rank_change ?? null,
              average_rank_change: summary.average_rank_change ?? null,
              listings_with_view_growth: summary.listings_with_view_growth ?? 0,
              listings_with_favorite_growth:
                summary.listings_with_favorite_growth ?? 0,
              rank_improved_count: summary.rank_improved_count ?? 0,
              rank_declined_count: summary.rank_declined_count ?? 0,
              rank_unchanged_count: summary.rank_unchanged_count ?? 0,
            }
          : null,

        top_mover: topMover
          ? {
              listing_id: topMover.listing_id,
              external_listing_id: topMover.external_listing_id,
              title: topMover.title,
              url: topMover.url,
              currency_code: topMover.currency_code,
              product_type: topMover.product_type,
              previous: topMover.previous,
              latest: topMover.latest,
              change: topMover.change,
              velocity: topMover.velocity,
              signal: topMover.signal,
            }
          : null,

        attention_score: calculateAttentionScore(analysis),
      };
    });

    const sortedMarkets = [...markets].sort((a, b) => {
      const aScore =
        "attention_score" in a && typeof a.attention_score === "number"
          ? a.attention_score
          : -1;

      const bScore =
        "attention_score" in b && typeof b.attention_score === "number"
          ? b.attention_score
          : -1;

      if (bScore !== aScore) {
        return bScore - aScore;
      }

      return a.keyword.localeCompare(b.keyword);
    });

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      tracked_market_count: trackedRows.length,
      ready_market_count: sortedMarkets.filter(
        (market) =>
          "has_meaningful_history" in market &&
          market.has_meaningful_history === true,
      ).length,
      collecting_market_count: sortedMarkets.filter(
        (market) =>
          "has_meaningful_history" in market &&
          market.has_meaningful_history === false,
      ).length,
      error_market_count: sortedMarkets.filter(
        (market) => market.status === "error",
      ).length,
      markets: sortedMarkets,
    });
  } catch (error) {
    console.error("TrendForge tracked markets error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "TrendForge was unable to load tracked markets.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 500,
      },
    );
  }
}
