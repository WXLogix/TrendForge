import { supabaseAdmin } from "@/lib/supabase-admin";

type ResearchRun = {
  id: number;
  keyword_id: number;
  source_id: number;
  run_type: string;
  total_result_count: number | null;
  returned_count: number;
  started_at: string;
  completed_at: string | null;
  status: string;
};

type ListingSnapshot = {
  research_run_id: number;
  listing_id: number;
  keyword_id: number;

  search_position: number | null;
  market_position: number | null;

  price: number | null;
  currency_code: string | null;

  views: number | null;
  favorites: number | null;

  quantity: number | null;
  state: string | null;

  original_creation_timestamp: number | null;
  updated_timestamp: number | null;

  observed_at: string;
};

type ListingRecord = {
  id: number;
  external_listing_id: string;
  external_shop_id: string | null;
  title: string;
  url: string | null;
  currency_code: string | null;
  original_creation_timestamp: number | null;
  tags: string[];
};

type RunListingRecord = {
  research_run_id: number;
  listing_id: number;
  relevance_status: string | null;
  relevance_reason: string | null;
  product_type: string | null;
};

type SignalLabel =
  | "collecting"
  | "surging"
  | "rising"
  | "steady"
  | "cooling"
  | "declining";

type ListingComparison = {
  listing_id: number;
  external_listing_id: string | null;

  title: string;
  url: string | null;

  currency_code: string | null;

  relevance_status: string | null;
  product_type: string | null;

  previous: {
    views: number | null;
    favorites: number | null;
    search_position: number | null;
    market_position: number | null;
    price: number | null;
  };

  latest: {
    views: number | null;
    favorites: number | null;
    search_position: number | null;
    market_position: number | null;
    price: number | null;
  };

  change: {
    views: number | null;
    favorites: number | null;

    /*
     * Positive means the listing improved in rank.
     *
     * Example:
     * previous #40
     * latest   #25
     *
     * rank change = +15
     */
    search_rank: number | null;
    market_rank: number | null;

    price: number | null;
  };

  velocity: {
    views_per_day: number | null;
    favorites_per_day: number | null;
    search_rank_positions_per_day: number | null;
    market_rank_positions_per_day: number | null;
  };

  signal: {
    score: number;
    label: SignalLabel;
  };
};

function calculateMedian(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);

  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function calculateAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safeDifference(latest: number | null, previous: number | null) {
  if (latest === null || previous === null) {
    return null;
  }

  return latest - previous;
}

function calculateRankChange(latest: number | null, previous: number | null) {
  if (latest === null || previous === null) {
    return null;
  }

  /*
   * Lower ranking numbers are better.
   *
   * previous #50
   * latest   #30
   *
   * 50 - 30 = +20 improvement
   */
  return previous - latest;
}

function calculateRate(change: number | null, elapsedDays: number) {
  if (change === null || elapsedDays <= 0) {
    return null;
  }

  return change / elapsedDays;
}

function scoreListing(
  viewChange: number | null,
  favoriteChange: number | null,
  searchRankChange: number | null,
  marketRankChange: number | null,
  elapsedDays: number,
): {
  score: number;
  label: Exclude<SignalLabel, "collecting">;
} {
  /*
   * This is an internal first-generation historical
   * movement score.
   *
   * It is NOT intended to be presented as a definitive
   * Opportunity Score.
   */

  let score = 0;

  const viewsPerDay = calculateRate(viewChange, elapsedDays) ?? 0;

  const favoritesPerDay = calculateRate(favoriteChange, elapsedDays) ?? 0;

  const rankMovement = marketRankChange ?? searchRankChange ?? 0;

  /*
   * View growth.
   */
  if (viewsPerDay > 0) {
    score += Math.min(40, Math.log10(viewsPerDay + 1) * 18);
  }

  /*
   * Favorite growth.
   */
  if (favoritesPerDay > 0) {
    score += Math.min(35, Math.log10(favoritesPerDay * 10 + 1) * 18);
  }

  /*
   * Search-rank improvement.
   */
  if (rankMovement > 0) {
    score += Math.min(25, rankMovement * 1.25);
  }

  /*
   * Measurable decline penalties.
   */
  if (viewsPerDay < 0) {
    score -= Math.min(20, Math.abs(viewsPerDay));
  }

  if (favoritesPerDay < 0) {
    score -= Math.min(20, Math.abs(favoritesPerDay * 5));
  }

  if (rankMovement < 0) {
    score -= Math.min(25, Math.abs(rankMovement * 1.25));
  }

  let label: "surging" | "rising" | "steady" | "cooling" | "declining";

  if (score >= 50) {
    label = "surging";
  } else if (score >= 20) {
    label = "rising";
  } else if (score >= -5) {
    label = "steady";
  } else if (score >= -20) {
    label = "cooling";
  } else {
    label = "declining";
  }

  return {
    score: Number(score.toFixed(3)),

    label,
  };
}

export async function analyzeKeywordTrends(keywordIdNumber: number) {
  try {
    if (!Number.isInteger(keywordIdNumber) || keywordIdNumber <= 0) {
      return { error: "A valid keyword ID is required." };
    }

    /*
     * ========================================================
     * 1. LOAD KEYWORD
     * ========================================================
     */

    const { data: keyword, error: keywordError } = await supabaseAdmin
      .from("keywords")
      .select(
        `
          id,
          keyword,
          category
        `,
      )
      .eq("id", keywordIdNumber)
      .single();

    if (keywordError || !keyword) {
      return {
        error: "Keyword could not be found.",
      };
    }

    /*
     * ========================================================
     * 2. FIND LATEST TWO COMPLETED RUNS
     * ========================================================
     */

    const { data: researchRuns, error: runsError } = await supabaseAdmin
      .from("research_runs")
      .select(
        `
          id,
          keyword_id,
          source_id,
          run_type,
          total_result_count,
          returned_count,
          started_at,
          completed_at,
          status
        `,
      )
      .eq("keyword_id", keywordIdNumber)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", {
        ascending: false,
      })
      .limit(2);

    if (runsError) {
      throw runsError;
    }

    const runs = (researchRuns ?? []) as ResearchRun[];

    /*
     * Not enough history at all.
     */
    if (runs.length < 2) {
      return {
        success: true,

        keyword: {
          id: keyword.id,
          keyword: keyword.keyword,
          category: keyword.category,
        },

        has_history: false,

        has_meaningful_history: false,

        history_status: "waiting_for_second_snapshot",

        completed_runs: runs.length,

        message:
          "TrendForge needs at least two completed research runs before historical movement can be measured.",

        latest_run: runs[0] ?? null,

        previous_run: null,

        summary: null,

        movers: [],

        declining: [],
      };
    }

    const latestRun = runs[0];

    const previousRun = runs[1];

    /*
     * ========================================================
     * 3. VERIFY SAME MARKET SOURCE
     * ========================================================
     */

    if (latestRun.source_id !== previousRun.source_id) {
      return {
        success: true,

        keyword: {
          id: keyword.id,
          keyword: keyword.keyword,
          category: keyword.category,
        },

        has_history: true,

        has_meaningful_history: false,

        history_status: "incompatible_runs",

        completed_runs: runs.length,

        message:
          "The latest two research runs use different marketplace sources and cannot be compared directly.",

        latest_run: latestRun,

        previous_run: previousRun,

        summary: null,

        movers: [],

        declining: [],
      };
    }

    /*
     * ========================================================
     * 4. CALCULATE ELAPSED TIME
     * ========================================================
     */

    const latestTime = new Date(latestRun.completed_at!).getTime();

    const previousTime = new Date(previousRun.completed_at!).getTime();

    const elapsedMs = latestTime - previousTime;

    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    const elapsedDays = elapsedHours / 24;

    if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) {
      throw new Error("The research run timestamps cannot be compared.");
    }

    /*
     * ========================================================
     * 5. MINIMUM HISTORY WINDOW
     * ========================================================
     *
     * Multiple snapshots technically give us historical data,
     * but snapshots collected only a few minutes apart do not
     * provide enough time for meaningful market conclusions.
     */

    const minimumHistoryHours = 12;

    const hasMeaningfulHistory = elapsedHours >= minimumHistoryHours;

    /*
     * ========================================================
     * 6. LOAD BOTH SNAPSHOT SETS
     * ========================================================
     */

    const { data: snapshotData, error: snapshotError } = await supabaseAdmin
      .from("listing_snapshots")
      .select(
        `
          research_run_id,
          listing_id,
          keyword_id,
          search_position,
          market_position,
          price,
          currency_code,
          views,
          favorites,
          quantity,
          state,
          original_creation_timestamp,
          updated_timestamp,
          observed_at
        `,
      )
      .in("research_run_id", [previousRun.id, latestRun.id]);

    if (snapshotError) {
      throw snapshotError;
    }

    const snapshots = (snapshotData ?? []) as ListingSnapshot[];

    const previousSnapshots = snapshots.filter(
      (snapshot) => snapshot.research_run_id === previousRun.id,
    );

    const latestSnapshots = snapshots.filter(
      (snapshot) => snapshot.research_run_id === latestRun.id,
    );

    /*
     * ========================================================
     * 7. BUILD SNAPSHOT MAPS
     * ========================================================
     */

    const previousMap = new Map<number, ListingSnapshot>();

    for (const snapshot of previousSnapshots) {
      previousMap.set(snapshot.listing_id, snapshot);
    }

    const latestMap = new Map<number, ListingSnapshot>();

    for (const snapshot of latestSnapshots) {
      latestMap.set(snapshot.listing_id, snapshot);
    }

    /*
     * ========================================================
     * 8. MATCH / NEW / MISSING LISTINGS
     * ========================================================
     */

    const matchedListingIds: number[] = [];

    const newListingIds: number[] = [];

    const disappearedListingIds: number[] = [];

    for (const listingId of latestMap.keys()) {
      if (previousMap.has(listingId)) {
        matchedListingIds.push(listingId);
      } else {
        newListingIds.push(listingId);
      }
    }

    for (const listingId of previousMap.keys()) {
      if (!latestMap.has(listingId)) {
        disappearedListingIds.push(listingId);
      }
    }

    /*
     * ========================================================
     * 9. LOAD LISTING METADATA
     * ========================================================
     */

    const allListingIds = Array.from(
      new Set([
        ...matchedListingIds,
        ...newListingIds,
        ...disappearedListingIds,
      ]),
    );

    let listingRecords: ListingRecord[] = [];

    if (allListingIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("listings")
        .select(
          `
            id,
            external_listing_id,
            external_shop_id,
            title,
            url,
            currency_code,
            original_creation_timestamp,
            tags
          `,
        )
        .in("id", allListingIds);

      if (error) {
        throw error;
      }

      listingRecords = (data ?? []) as ListingRecord[];
    }

    const listingMap = new Map<number, ListingRecord>();

    for (const listing of listingRecords) {
      listingMap.set(listing.id, listing);
    }

    /*
     * ========================================================
     * 10. LOAD LATEST RELEVANCE CLASSIFICATION
     * ========================================================
     */

    let latestRunListings: RunListingRecord[] = [];

    if (latestMap.size > 0) {
      const { data, error } = await supabaseAdmin
        .from("research_run_listings")
        .select(
          `
            research_run_id,
            listing_id,
            relevance_status,
            relevance_reason,
            product_type
          `,
        )
        .eq("research_run_id", latestRun.id);

      if (error) {
        throw error;
      }

      latestRunListings = (data ?? []) as RunListingRecord[];
    }

    const relevanceMap = new Map<number, RunListingRecord>();

    for (const record of latestRunListings) {
      relevanceMap.set(record.listing_id, record);
    }

    /*
     * ========================================================
     * 11. CALCULATE HISTORICAL MOVEMENT
     * ========================================================
     */

    const comparisons: ListingComparison[] = [];

    for (const listingId of matchedListingIds) {
      const previous = previousMap.get(listingId);

      const latest = latestMap.get(listingId);

      if (!previous || !latest) {
        continue;
      }

      const listing = listingMap.get(listingId);

      const relevance = relevanceMap.get(listingId);

      /*
       * Only relevant listings contribute to
       * product-trend analysis.
       */
      if (relevance && relevance.relevance_status !== "relevant") {
        continue;
      }

      const viewChange = safeDifference(latest.views, previous.views);

      const favoriteChange = safeDifference(
        latest.favorites,
        previous.favorites,
      );

      const searchRankChange = calculateRankChange(
        latest.search_position,
        previous.search_position,
      );

      const marketRankChange = calculateRankChange(
        latest.market_position,
        previous.market_position,
      );

      const priceChange = safeDifference(latest.price, previous.price);

      /*
       * If enough time has not elapsed yet, we deliberately
       * refuse to label listings steady/rising/declining.
       */

      const historicalSignal: {
        score: number;
        label: SignalLabel;
      } = hasMeaningfulHistory
        ? scoreListing(
            viewChange,
            favoriteChange,
            searchRankChange,
            marketRankChange,
            elapsedDays,
          )
        : {
            score: 0,
            label: "collecting",
          };

      comparisons.push({
        listing_id: listingId,

        external_listing_id: listing?.external_listing_id ?? null,

        title: listing?.title ?? "Unknown listing",

        url: listing?.url ?? null,

        currency_code: latest.currency_code ?? listing?.currency_code ?? null,

        relevance_status: relevance?.relevance_status ?? null,

        product_type: relevance?.product_type ?? null,

        previous: {
          views: previous.views,

          favorites: previous.favorites,

          search_position: previous.search_position,

          market_position: previous.market_position,

          price: previous.price,
        },

        latest: {
          views: latest.views,

          favorites: latest.favorites,

          search_position: latest.search_position,

          market_position: latest.market_position,

          price: latest.price,
        },

        change: {
          views: viewChange,

          favorites: favoriteChange,

          search_rank: searchRankChange,

          market_rank: marketRankChange,

          price: priceChange,
        },

        velocity: {
          views_per_day: calculateRate(viewChange, elapsedDays),

          favorites_per_day: calculateRate(favoriteChange, elapsedDays),

          search_rank_positions_per_day: calculateRate(
            searchRankChange,
            elapsedDays,
          ),

          market_rank_positions_per_day: calculateRate(
            marketRankChange,
            elapsedDays,
          ),
        },

        signal: historicalSignal,
      });
    }

    /*
     * ========================================================
     * 12. SUMMARY STATISTICS
     * ========================================================
     */

    const viewChanges = comparisons
      .map((item) => item.change.views)
      .filter((value): value is number => value !== null);

    const favoriteChanges = comparisons
      .map((item) => item.change.favorites)
      .filter((value): value is number => value !== null);

    const rankChanges = comparisons
      .map((item) => item.change.market_rank ?? item.change.search_rank)
      .filter((value): value is number => value !== null);

    const improvedRankCount = rankChanges.filter((value) => value > 0).length;

    const declinedRankCount = rankChanges.filter((value) => value < 0).length;

    const unchangedRankCount = rankChanges.filter(
      (value) => value === 0,
    ).length;

    const listingsWithViewGrowth = viewChanges.filter(
      (value) => value > 0,
    ).length;

    const listingsWithFavoriteGrowth = favoriteChanges.filter(
      (value) => value > 0,
    ).length;

    /*
     * ========================================================
     * 13. SORT POSITIVE / NEGATIVE MOVERS
     * ========================================================
     */

    const movers = hasMeaningfulHistory
      ? [...comparisons]
          .sort((a, b) => b.signal.score - a.signal.score)
          .slice(0, 25)
      : [];

    const declining = hasMeaningfulHistory
      ? [...comparisons]
          .filter(
            (item) =>
              item.signal.label === "cooling" ||
              item.signal.label === "declining",
          )
          .sort((a, b) => a.signal.score - b.signal.score)
          .slice(0, 10)
      : [];

    /*
     * ========================================================
     * 14. RESPONSE
     * ========================================================
     */

    return {
      success: true,

      keyword: {
        id: keyword.id,

        keyword: keyword.keyword,

        category: keyword.category,
      },

      /*
       * Two or more snapshots exist.
       */
      has_history: true,

      /*
       * Enough time has actually passed to evaluate them.
       */
      has_meaningful_history: hasMeaningfulHistory,

      history_status: hasMeaningfulHistory ? "ready" : "collecting",

      history_message: hasMeaningfulHistory
        ? "Enough time has passed to evaluate historical market movement."
        : `TrendForge has multiple snapshots, but at least ${minimumHistoryHours} hours of history is needed before movement signals are considered meaningful.`,

      minimum_history_hours: minimumHistoryHours,

      latest_run: {
        id: latestRun.id,

        completed_at: latestRun.completed_at,

        total_result_count: latestRun.total_result_count,

        returned_count: latestRun.returned_count,
      },

      previous_run: {
        id: previousRun.id,

        completed_at: previousRun.completed_at,

        total_result_count: previousRun.total_result_count,

        returned_count: previousRun.returned_count,
      },

      comparison_window: {
        elapsed_hours: Number(elapsedHours.toFixed(2)),

        elapsed_days: Number(elapsedDays.toFixed(3)),
      },

      coverage: {
        previous_snapshot_count: previousSnapshots.length,

        latest_snapshot_count: latestSnapshots.length,

        matched_listings: matchedListingIds.length,

        compared_relevant_listings: comparisons.length,

        new_to_latest_run: newListingIds.length,

        disappeared_from_latest_run: disappearedListingIds.length,
      },

      summary: {
        /*
         * Raw deltas are still useful diagnostically,
         * even before the meaningful-history threshold.
         */
        median_view_change: calculateMedian(viewChanges),

        average_view_change: calculateAverage(viewChanges),

        median_favorite_change: calculateMedian(favoriteChanges),

        average_favorite_change: calculateAverage(favoriteChanges),

        median_rank_change: calculateMedian(rankChanges),

        average_rank_change: calculateAverage(rankChanges),

        listings_with_view_growth: listingsWithViewGrowth,

        listings_with_favorite_growth: listingsWithFavoriteGrowth,

        rank_improved_count: improvedRankCount,

        rank_declined_count: declinedRankCount,

        rank_unchanged_count: unchangedRankCount,

        collecting_count: comparisons.filter(
          (item) => item.signal.label === "collecting",
        ).length,

        surging_count: comparisons.filter(
          (item) => item.signal.label === "surging",
        ).length,

        rising_count: comparisons.filter(
          (item) => item.signal.label === "rising",
        ).length,

        steady_count: comparisons.filter(
          (item) => item.signal.label === "steady",
        ).length,

        cooling_count: comparisons.filter(
          (item) => item.signal.label === "cooling",
        ).length,

        declining_count: comparisons.filter(
          (item) => item.signal.label === "declining",
        ).length,
      },

      /*
       * We deliberately return no ranked movers until
       * enough time has passed.
       */
      movers,

      declining,
    };
  } catch (error) {
    console.error("TrendForge historical comparison error:", error);

    return {
      error: "TrendForge was unable to calculate historical trends.",

      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
