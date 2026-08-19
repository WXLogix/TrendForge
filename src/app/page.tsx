"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SearchStatus = "idle" | "loading" | "success" | "error";
type TrackingFrequency = "daily" | "weekly" | "manual";

type RelevanceStatus = "relevant" | "excluded" | "uncertain" | "unclassified";

type EtsyListingResult = {
  position: number;
  market_position?: number;

  listing_id: number;
  shop_id: number;

  title: string;
  image_url: string | null;

  price: number | null;
  currency: string | null;

  favorites: number;
  views: number | null;

  quantity: number | null;
  state: string;

  url: string;

  original_creation_timestamp: number | null;
  updated_timestamp: number | null;

  tags: string[];

  /*
   * Product relevance classification returned by
   * the Etsy collector.
   */
  relevance_status?: RelevanceStatus;
  relevance_reason?: string | null;
  product_type?: string | null;
};

type MarketSummary = {
  research_run_id: number;
  keyword_id: number;
  source_id: number;

  total_result_count: number | null;

  usd_listing_count: number | null;
  lowest_usd_price: number | null;
  median_usd_price: number | null;
  average_usd_price: number | null;
  highest_usd_price: number | null;

  cad_listing_count: number | null;
  lowest_cad_price: number | null;
  median_cad_price: number | null;
  average_cad_price: number | null;
  highest_cad_price: number | null;

  median_views: number | null;
  average_views: number | null;

  median_favorites: number | null;
  average_favorites: number | null;

  listings_under_30_days: number | null;
  listings_under_90_days: number | null;
  listings_under_180_days: number | null;
};

type SearchAnalysis = {
  success: boolean;

  keyword: string;
  keyword_id: number;

  source: {
    id: number;
    code: string;
    name: string;
  };

  market?: {
    code: string;
    currencies: string[];
    target_results: number;
    examined_results: number;
    pages_fetched: number;
  };

  relevance?: {
    search_intent: string;
    model: string;
    collected: number;
    relevant: number;
    uncertain: number;
    excluded: number;
  };

  tracking: {
    is_tracked: boolean;
    tracked_keyword_id: number | null;
    frequency: TrackingFrequency | null;
  };

  research_run_id: number;

  total_results: number;
  requested_results: number;
  stored_results: number;

  market_summary: MarketSummary;

  results: EtsyListingResult[];
};

type TagCount = {
  tag: string;
  count: number;
};

type RisingListing = EtsyListingResult & {
  ageDays: number;

  viewsPerDay: number;
  favoritesPerDay: number;

  favoriteRate: number;

  viewVelocityPercentile: number;
  favoriteVelocityPercentile: number;

  risingScore: number;

  reasons: string[];
};

type TrackedMarketFilter = "all" | "surging" | "rising" | "cooling";

type TrackedMarketTopMover = {
  listing_id: number;
  external_listing_id: string | null;
  title: string;
  url: string | null;
  currency_code: string | null;
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
    label:
      | "collecting"
      | "surging"
      | "rising"
      | "steady"
      | "cooling"
      | "declining";
  };
};

type TrackedMarket = {
  tracking_id: number;
  keyword_id: number;
  keyword: string;
  category: string | null;
  source: {
    id: number;
    code: string;
    name: string;
  } | null;
  tracking_frequency: TrackingFrequency;
  last_collected_at: string | null;
  next_collection_at: string | null;
  status: "ok" | "error";
  error?: string;
  details?: unknown;
  has_history?: boolean;
  has_meaningful_history?: boolean;
  history_status?: string;
  history_message?: string | null;
  comparison_window?: {
    elapsed_hours: number;
    elapsed_days: number;
  } | null;
  latest_run?: {
    id: number;
    completed_at: string | null;
    total_result_count: number | null;
    returned_count: number;
  } | null;
  previous_run?: {
    id: number;
    completed_at: string | null;
    total_result_count: number | null;
    returned_count: number;
  } | null;
  marketplace?: {
    latest_result_count: number | null;
    previous_result_count: number | null;
    result_count_change: number | null;
  };
  coverage?: {
    previous_snapshot_count: number;
    latest_snapshot_count: number;
    matched_listings: number;
    compared_relevant_listings: number;
    new_to_latest_run: number;
    disappeared_from_latest_run: number;
  } | null;
  signals?: {
    collecting: number;
    surging: number;
    rising: number;
    steady: number;
    cooling: number;
    declining: number;
  } | null;
  movement?: {
    median_view_change: number | null;
    average_view_change: number | null;
    median_favorite_change: number | null;
    average_favorite_change: number | null;
    median_rank_change: number | null;
    average_rank_change: number | null;
    listings_with_view_growth: number;
    listings_with_favorite_growth: number;
    rank_improved_count: number;
    rank_declined_count: number;
    rank_unchanged_count: number;
  } | null;
  top_mover?: TrackedMarketTopMover | null;
  attention_score?: number;
};

type TrackedMarketsResponse = {
  success: boolean;
  generated_at: string;
  tracked_market_count: number;
  ready_market_count: number;
  collecting_market_count: number;
  error_market_count: number;
  markets: TrackedMarket[];
};

const ANALYSIS_STORAGE_PREFIX = "trendforge:analysis:";

function getAnalysisStorageKey(runId: number | string) {
  return `${ANALYSIS_STORAGE_PREFIX}${runId}`;
}

function saveAnalysisToSession(analysis: SearchAnalysis) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getAnalysisStorageKey(analysis.research_run_id),
      JSON.stringify(analysis),
    );
  } catch (error) {
    console.warn("TrendForge could not cache the current analysis:", error);
  }
}

function loadAnalysisFromSession(runId: string): SearchAnalysis | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(getAnalysisStorageKey(runId));

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as SearchAnalysis;

    if (
      !parsed ||
      parsed.success !== true ||
      String(parsed.research_run_id) !== runId
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn("TrendForge could not restore the cached analysis:", error);
    return null;
  }
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatDecimal(value: number | null | undefined, decimals = 1) {
  if (value === null || value === undefined) {
    return "—";
  }

  return value.toFixed(decimals);
}

function formatPrice(price: number | null, currency: string | null) {
  if (price === null || !currency) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
}

function getListingAge(timestamp: number | null) {
  if (!timestamp) {
    return "Unknown age";
  }

  const created = new Date(timestamp * 1000);
  const now = new Date();

  const difference = now.getTime() - created.getTime();

  if (difference < 0) {
    return "New";
  }

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));

  if (days < 1) {
    return "Today";
  }

  if (days === 1) {
    return "1 day old";
  }

  if (days < 30) {
    return `${days} days old`;
  }

  const months = Math.floor(days / 30);

  if (months < 12) {
    return `${months} ${months === 1 ? "month" : "months"} old`;
  }

  const years = Math.floor(months / 12);

  return `${years} ${years === 1 ? "year" : "years"} old`;
}

function decodeHtml(value: string) {
  if (typeof document === "undefined") {
    return value;
  }

  const textarea = document.createElement("textarea");

  textarea.innerHTML = value;

  return textarea.value;
}

function percentileRank(value: number, values: number[]) {
  if (values.length <= 1) {
    return 100;
  }

  const belowOrEqual = values.filter((item) => item <= value).length;

  return (belowOrEqual / values.length) * 100;
}

function formatVelocity(value: number, decimals = 1) {
  if (value === 0) {
    return "0";
  }

  if (value < 0.1) {
    return value.toFixed(2);
  }

  return value.toFixed(decimals);
}

function formatSignedNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (value === 0) {
    return "0";
  }

  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatCompactDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not collected yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function signalTextClass(label: TrackedMarketTopMover["signal"]["label"]) {
  switch (label) {
    case "surging":
      return "text-fuchsia-300";
    case "rising":
      return "text-green-300";
    case "steady":
      return "text-zinc-300";
    case "cooling":
      return "text-amber-300";
    case "declining":
      return "text-red-300";
    default:
      return "text-zinc-400";
  }
}

export default function Home() {
  const [searchTerm, setSearchTerm] = useState("");

  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");

  const [searchMessage, setSearchMessage] = useState("");

  const [analysis, setAnalysis] = useState<SearchAnalysis | null>(null);

  const [trackingFrequency, setTrackingFrequency] =
    useState<TrackingFrequency>("daily");

  const [trackingBusy, setTrackingBusy] = useState(false);

  const [trackingMessage, setTrackingMessage] = useState("");

  const [trackedMarkets, setTrackedMarkets] = useState<TrackedMarket[]>([]);

  const [trackedMarketsStatus, setTrackedMarketsStatus] =
    useState<SearchStatus>("loading");

  const [trackedMarketsMessage, setTrackedMarketsMessage] = useState("");

  const [trackedMarketFilter, setTrackedMarketFilter] =
    useState<TrackedMarketFilter>("all");

  const [expandedTrackedMarketId, setExpandedTrackedMarketId] = useState<
    number | null
  >(null);

  const [trackedMarketsMeta, setTrackedMarketsMeta] = useState({
    tracked: 0,
    ready: 0,
    collecting: 0,
    errors: 0,
  });

  async function loadTrackedMarkets() {
    setTrackedMarketsStatus("loading");
    setTrackedMarketsMessage("");

    try {
      const response = await fetch("/api/tracked-markets", {
        cache: "no-store",
      });

      const data = (await response.json()) as TrackedMarketsResponse & {
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load tracked markets.");
      }

      setTrackedMarkets(data.markets ?? []);
      setTrackedMarketsMeta({
        tracked: data.tracked_market_count ?? 0,
        ready: data.ready_market_count ?? 0,
        collecting: data.collecting_market_count ?? 0,
        errors: data.error_market_count ?? 0,
      });
      setTrackedMarketsStatus("success");
    } catch (error) {
      setTrackedMarketsStatus("error");
      setTrackedMarketsMessage(
        error instanceof Error
          ? error.message
          : "Unable to load tracked markets.",
      );
    }
  }

  useEffect(() => {
    void loadTrackedMarkets();
  }, []);

  /*
   * ==========================================================
   * RESTORE SAVED DASHBOARD ANALYSIS
   * ==========================================================
   *
   * A completed dashboard analysis is cached for this browser
   * tab and its research-run ID is placed in the URL.
   *
   * That means:
   *
   * Dashboard -> View All Results -> Back to TrendForge
   *
   * returns to the analysis instead of an empty homepage.
   *
   * Refreshing /?run=123 in the same tab also restores the
   * analysis without creating another Etsy research run.
   */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const runId = params.get("run");

    if (!runId) {
      return;
    }

    const restored = loadAnalysisFromSession(runId);

    if (!restored) {
      return;
    }

    setAnalysis(restored);
    setSearchTerm(restored.keyword);
    setTrackingFrequency(restored.tracking?.frequency ?? "daily");
    setSearchStatus("success");
    setSearchMessage("");
  }, []);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const keyword = searchTerm.trim();

    if (!keyword) {
      setSearchStatus("error");
      setSearchMessage("Enter a keyword to analyze.");

      return;
    }

    setSearchStatus("loading");

    setSearchMessage("");
    setTrackingMessage("");

    setAnalysis(null);

    try {
      const response = await fetch(
        `/api/etsy/search?keyword=${encodeURIComponent(keyword)}`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to analyze keyword.");
      }

      const searchAnalysis = data as SearchAnalysis;

      setAnalysis(searchAnalysis);

      saveAnalysisToSession(searchAnalysis);

      setTrackingFrequency(searchAnalysis.tracking?.frequency ?? "daily");

      setSearchStatus("success");

      /*
       * Preserve the current run in the URL without causing a
       * navigation or another research request.
       */
      window.history.replaceState(
        null,
        "",
        `/?run=${searchAnalysis.research_run_id}`,
      );
    } catch (error) {
      setSearchStatus("error");

      setSearchMessage(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    }
  }

  async function handleTracking(action: "track" | "untrack") {
    if (!analysis) {
      return;
    }

    setTrackingBusy(true);
    setTrackingMessage("");

    try {
      const response = await fetch("/api/tracking", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          keyword_id: analysis.keyword_id,

          action,

          frequency: trackingFrequency,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update tracking.");
      }

      setAnalysis((current) => {
        if (!current) {
          return current;
        }

        const updatedAnalysis: SearchAnalysis = {
          ...current,

          tracking: {
            is_tracked: data.tracking?.is_active ?? false,

            tracked_keyword_id: data.tracking?.id ?? null,

            frequency: data.tracking?.tracking_frequency ?? null,
          },
        };

        saveAnalysisToSession(updatedAnalysis);

        return updatedAnalysis;
      });

      setTrackingMessage(data.message ?? "");
      void loadTrackedMarkets();
    } catch (error) {
      setTrackingMessage(
        error instanceof Error ? error.message : "Unable to update tracking.",
      );
    } finally {
      setTrackingBusy(false);
    }
  }

  /*
   * ==========================================================
   * RELEVANT RESULTS
   * ==========================================================
   *
   * The marketplace result set still contains all 100 items.
   *
   * This subset represents the listings TrendForge considers
   * appropriate for the user's requested product type.
   */

  const relevantListings = useMemo(() => {
    if (!analysis) {
      return [];
    }

    return analysis.results.filter(
      (listing) => listing.relevance_status === "relevant",
    );
  }, [analysis]);

  /*
   * ==========================================================
   * TAG ANALYSIS
   * ==========================================================
   *
   * Only relevant listings contribute to Trending Language.
   *
   * For example, an SVG bundle returned during a shirt search
   * will no longer introduce SVG / Cricut / cut-file tags.
   */

  const topTags = useMemo<TagCount[]>(() => {
    if (!analysis) {
      return [];
    }

    const counts = new Map<string, number>();

    for (const listing of relevantListings) {
      const uniqueTags = new Set(
        listing.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      );

      for (const tag of uniqueTags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([tag, count]) => ({
        tag,
        count,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return a.tag.localeCompare(b.tag);
      })
      .slice(0, 20);
  }, [relevantListings]);

  /*
   * ==========================================================
   * MARKETPLACE LISTING PREVIEW
   * ==========================================================
   *
   * We intentionally keep this as the raw Etsy result order.
   *
   * The purpose of "Top Search Results" is to show what Etsy
   * actually returned, even when an adjacent product appears.
   */

  const displayedListings = useMemo(() => {
    if (!analysis) {
      return [];
    }

    return analysis.results.slice(0, 12);
  }, [analysis]);

  /*
   * ==========================================================
   * NEW & RISING — RELEVANCE + VELOCITY MODEL
   * ==========================================================
   *
   * Eligibility requirements:
   *
   * 1. Listing must be RELEVANT to the requested product type.
   * 2. Listing must be no more than 180 days old.
   * 3. Listing must show enough engagement evidence.
   *
   * Evidence threshold:
   *
   * For listings 7 days old or newer:
   * - at least 25 views
   * OR
   * - at least 1 favorite
   *
   * For listings older than 7 days:
   * - at least 10 views
   * OR
   * - at least 2 favorites
   * OR
   * - at least 3 views/day
   * OR
   * - at least 0.15 favorites/day
   *
   * Scoring:
   *
   * View velocity percentile:       35
   * Favorite velocity percentile:   35
   * Freshness:                      20
   * Etsy position:                  10
   *
   * Total:                         100
   *
   * This is still current-performance inference.
   *
   * Once multiple snapshots exist, TrendForge will be able to
   * measure REAL changes in views, favorites, and ranking.
   */

  const risingListings = useMemo<RisingListing[]>(() => {
    if (!analysis) {
      return [];
    }

    const now = Date.now();

    /*
     * Build the relevance-filtered candidate pool first.
     */

    const candidates = relevantListings
      .map((listing) => {
        if (!listing.original_creation_timestamp) {
          return null;
        }

        const createdAt = listing.original_creation_timestamp * 1000;

        const ageDays = Math.max(
          0,
          Math.floor((now - createdAt) / (1000 * 60 * 60 * 24)),
        );

        /*
         * New & Rising is intentionally focused on
         * the first six months.
         */

        if (ageDays > 180) {
          return null;
        }

        const effectiveDays = Math.max(ageDays, 1);

        const views = listing.views ?? 0;

        const favorites = listing.favorites ?? 0;

        const viewsPerDay = views / effectiveDays;

        const favoritesPerDay = favorites / effectiveDays;

        const favoriteRate = views > 0 ? (favorites / views) * 100 : 0;

        /*
         * Minimum evidence threshold.
         *
         * A listing is not "rising" just because it was
         * uploaded yesterday.
         */

        const hasEnoughEvidence =
          ageDays <= 7
            ? views >= 25 || favorites >= 1
            : views >= 10 ||
              favorites >= 2 ||
              viewsPerDay >= 3 ||
              favoritesPerDay >= 0.15;

        if (!hasEnoughEvidence) {
          return null;
        }

        return {
          listing,

          ageDays,

          viewsPerDay,

          favoritesPerDay,

          favoriteRate,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          listing: EtsyListingResult;
          ageDays: number;
          viewsPerDay: number;
          favoritesPerDay: number;
          favoriteRate: number;
        } => candidate !== null,
      );

    if (candidates.length === 0) {
      return [];
    }

    /*
     * Compare velocity only against other eligible,
     * relevant young listings.
     */

    const viewVelocities = candidates.map((candidate) => candidate.viewsPerDay);

    const favoriteVelocities = candidates.map(
      (candidate) => candidate.favoritesPerDay,
    );

    return candidates
      .map((candidate) => {
        const { listing, ageDays, viewsPerDay, favoritesPerDay, favoriteRate } =
          candidate;

        /*
         * ----------------------------------------------------
         * VELOCITY
         * ----------------------------------------------------
         */

        const viewVelocityPercentile = percentileRank(
          viewsPerDay,
          viewVelocities,
        );

        const favoriteVelocityPercentile = percentileRank(
          favoritesPerDay,
          favoriteVelocities,
        );

        const viewVelocityScore = (viewVelocityPercentile / 100) * 35;

        const favoriteVelocityScore = (favoriteVelocityPercentile / 100) * 35;

        /*
         * ----------------------------------------------------
         * FRESHNESS
         * ----------------------------------------------------
         *
         * Freshness helps, but it cannot independently make
         * a listing eligible because the evidence threshold
         * has already been applied.
         */

        let freshnessScore = 0;

        if (ageDays <= 14) {
          freshnessScore = 20;
        } else if (ageDays <= 30) {
          freshnessScore = 18;
        } else if (ageDays <= 60) {
          freshnessScore = 15;
        } else if (ageDays <= 90) {
          freshnessScore = 12;
        } else if (ageDays <= 120) {
          freshnessScore = 8;
        } else {
          freshnessScore = 5;
        }

        /*
         * ----------------------------------------------------
         * ETSY SEARCH POSITION
         * ----------------------------------------------------
         */

        const rankPercent = Math.max(
          0,
          Math.min(1, (101 - listing.position) / 100),
        );

        const rankScore = rankPercent * 10;

        /*
         * ----------------------------------------------------
         * FINAL INTERNAL SCORE
         * ----------------------------------------------------
         */

        const risingScore =
          viewVelocityScore +
          favoriteVelocityScore +
          freshnessScore +
          rankScore;

        /*
         * ----------------------------------------------------
         * USER-FACING EVIDENCE
         * ----------------------------------------------------
         */

        const reasons: string[] = [];

        reasons.push(`${formatVelocity(viewsPerDay, 1)} views/day`);

        reasons.push(`${formatVelocity(favoritesPerDay, 2)} favorites/day`);

        if (ageDays === 0) {
          reasons.push("Listed today");
        } else if (ageDays === 1) {
          reasons.push("Listed 1 day ago");
        } else {
          reasons.push(`Listed ${formatNumber(ageDays)} days ago`);
        }

        return {
          ...listing,

          ageDays,

          viewsPerDay,

          favoritesPerDay,

          favoriteRate,

          viewVelocityPercentile,

          favoriteVelocityPercentile,

          risingScore,

          reasons,
        };
      })
      .sort((a, b) => b.risingScore - a.risingScore)
      .slice(0, 4);
  }, [relevantListings]);

  const filteredTrackedMarkets = useMemo(() => {
    if (trackedMarketFilter === "all") {
      return trackedMarkets;
    }

    return trackedMarkets.filter((market) => {
      const signals = market.signals;

      if (!signals) {
        return false;
      }

      if (trackedMarketFilter === "surging") {
        return signals.surging > 0;
      }

      if (trackedMarketFilter === "rising") {
        return signals.rising > 0 || signals.surging > 0;
      }

      return signals.cooling > 0 || signals.declining > 0;
    });
  }, [trackedMarketFilter, trackedMarkets]);

  const cadCount = analysis?.market_summary.cad_listing_count ?? 0;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* =====================================================
            HEADER
        ====================================================== */}

        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-400">
            Market Intelligence
          </p>

          <h1 className="mt-2 text-4xl font-bold">TrendForge</h1>

          <p className="mt-3 max-w-2xl text-zinc-400">
            Discover emerging product trends, research keywords, and find
            opportunities worth designing for.
          </p>
        </header>

        {/* =====================================================
            KEYWORD SEARCH
        ====================================================== */}

        <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm font-medium text-orange-400">
            KEYWORD RESEARCH
          </p>

          <h2 className="mt-2 text-2xl font-semibold">
            What do you want to research?
          </h2>

          <p className="mt-2 text-zinc-400">
            Search a product, niche, theme, or design idea.
          </p>

          <form
            onSubmit={handleSearch}
            className="mt-6 flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);

                if (searchStatus === "error") {
                  setSearchStatus("idle");

                  setSearchMessage("");
                }
              }}
              placeholder="Try: bigfoot shirt"
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none placeholder:text-zinc-600 focus:border-orange-500"
            />

            <button
              type="submit"
              disabled={searchStatus === "loading"}
              className="rounded-xl bg-orange-500 px-6 py-3 font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searchStatus === "loading" ? "Analyzing..." : "Analyze"}
            </button>
          </form>

          {searchStatus === "idle" && (
            <p className="mt-3 text-xs text-zinc-500">
              Searches create research snapshots. Tracking is optional.
            </p>
          )}

          {searchStatus === "loading" && (
            <p className="mt-3 text-sm text-zinc-400">
              Searching Etsy and analyzing 100 U.S. and Canadian marketplace
              results...
            </p>
          )}

          {searchStatus === "error" && (
            <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4">
              <p className="text-sm font-medium text-red-400">
                {searchMessage}
              </p>
            </div>
          )}
        </section>

        {/* =====================================================
            TRACKED MARKETS
        ====================================================== */}

        <section className="mt-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-orange-400">
                TRACKED MARKETS
              </p>

              <h2 className="mt-1 text-2xl font-semibold">
                Markets TrendForge is monitoring over time
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                Historical movement from saved research snapshots. Use this list
                to quickly spot markets with active movers, then expand a row
                for more detail.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400">
                {trackedMarketsMeta.tracked} tracked
              </span>

              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400">
                {trackedMarketsMeta.ready} ready
              </span>

              <button
                type="button"
                onClick={() => void loadTrackedMarkets()}
                disabled={trackedMarketsStatus === "loading"}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-orange-500 hover:text-orange-400 disabled:opacity-50"
              >
                {trackedMarketsStatus === "loading"
                  ? "Refreshing..."
                  : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {(
              ["all", "surging", "rising", "cooling"] as TrackedMarketFilter[]
            ).map((filter) => {
              const active = trackedMarketFilter === filter;

              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setTrackedMarketFilter(filter)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    active
                      ? "border-orange-500 bg-orange-500/10 text-orange-400"
                      : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          {trackedMarketsStatus === "error" && (
            <div className="mt-5 rounded-xl border border-red-900 bg-red-950/40 p-4">
              <p className="text-sm font-medium text-red-400">
                {trackedMarketsMessage || "Unable to load tracked markets."}
              </p>
            </div>
          )}

          {trackedMarketsStatus === "loading" &&
            trackedMarkets.length === 0 && (
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                <p className="text-sm text-zinc-500">
                  Loading tracked markets...
                </p>
              </div>
            )}

          {filteredTrackedMarkets.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="hidden grid-cols-[52px_minmax(220px,1.5fr)_110px_110px_88px_88px_110px_44px] gap-3 border-b border-zinc-800 bg-zinc-950/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 lg:grid">
                <span>#</span>
                <span>Market</span>
                <span>Results</span>
                <span>Δ Market</span>
                <span>Surging</span>
                <span>Rising</span>
                <span>Attention</span>
                <span />
              </div>

              <div className="divide-y divide-zinc-800">
                {filteredTrackedMarkets.map((market, index) => {
                  const isExpanded =
                    expandedTrackedMarketId === market.keyword_id;

                  const marketplace = market.marketplace ?? {
                    latest_result_count: null,
                    previous_result_count: null,
                    result_count_change: null,
                  };

                  const resultChange = marketplace.result_count_change ?? 0;

                  const resultChangeClass =
                    resultChange > 0
                      ? "text-amber-300"
                      : resultChange < 0
                        ? "text-emerald-400"
                        : "text-zinc-500";

                  const topMover = market.top_mover ?? null;

                  const signals = market.signals ?? {
                    collecting: 0,
                    surging: 0,
                    rising: 0,
                    steady: 0,
                    cooling: 0,
                    declining: 0,
                  };

                  const coverage = market.coverage ?? {
                    previous_snapshot_count: 0,
                    latest_snapshot_count: 0,
                    matched_listings: 0,
                    compared_relevant_listings: 0,
                    new_to_latest_run: 0,
                    disappeared_from_latest_run: 0,
                  };

                  return (
                    <div key={market.keyword_id}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTrackedMarketId((current) =>
                            current === market.keyword_id
                              ? null
                              : market.keyword_id,
                          )
                        }
                        className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-zinc-950/40 lg:grid-cols-[52px_minmax(220px,1.5fr)_110px_110px_88px_88px_110px_44px] lg:items-center"
                      >
                        <div className="hidden text-sm font-medium text-zinc-600 lg:block">
                          {index + 1}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold capitalize text-white">
                              {market.keyword}
                            </h3>

                            {signals.surging > 0 && (
                              <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-fuchsia-400">
                                {signals.surging} surging
                              </span>
                            )}

                            {signals.rising > 0 && signals.surging === 0 && (
                              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">
                                {signals.rising} rising
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 lg:hidden">
                            <span>
                              {formatNumber(marketplace.latest_result_count)}{" "}
                              results
                            </span>
                            <span className={resultChangeClass}>
                              {resultChange > 0 ? "+" : ""}
                              {formatNumber(resultChange)}
                            </span>
                            <span>
                              {formatDecimal(market.attention_score, 1)}{" "}
                              attention
                            </span>
                          </div>
                        </div>

                        <div className="hidden text-sm font-medium text-zinc-300 lg:block">
                          {formatNumber(marketplace.latest_result_count)}
                        </div>

                        <div
                          className={`hidden text-sm font-semibold lg:block ${resultChangeClass}`}
                        >
                          {resultChange > 0 ? "+" : ""}
                          {formatNumber(resultChange)}
                        </div>

                        <div className="hidden text-sm font-semibold text-fuchsia-400 lg:block">
                          {signals.surging}
                        </div>

                        <div className="hidden text-sm font-semibold text-emerald-400 lg:block">
                          {signals.rising}
                        </div>

                        <div className="hidden lg:block">
                          <span className="inline-flex min-w-[58px] justify-center rounded-lg bg-orange-500/10 px-2.5 py-1.5 text-sm font-bold text-orange-400">
                            {formatDecimal(market.attention_score, 1)}
                          </span>
                        </div>

                        <div className="flex justify-end">
                          <span
                            className={`text-lg text-zinc-500 transition ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          >
                            ⌄
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-zinc-800 bg-zinc-950/50 px-4 py-5">
                          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                                    Signal breakdown
                                  </p>

                                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                    <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 font-semibold text-fuchsia-400">
                                      {signals.surging} Surging
                                    </span>
                                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-400">
                                      {signals.rising} Rising
                                    </span>
                                    <span className="rounded-full bg-zinc-800 px-2.5 py-1 font-semibold text-zinc-400">
                                      {signals.steady} Steady
                                    </span>
                                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-400">
                                      {signals.cooling} Cooling
                                    </span>
                                    <span className="rounded-full bg-red-500/10 px-2.5 py-1 font-semibold text-red-400">
                                      {signals.declining} Declining
                                    </span>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <p className="text-xs uppercase tracking-wide text-zinc-600">
                                    Window
                                  </p>
                                  <p className="mt-1 font-semibold text-white">
                                    {formatDecimal(
                                      market.comparison_window?.elapsed_hours ??
                                        null,
                                      1,
                                    )}
                                    h
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-lg bg-zinc-900 p-3">
                                  <p className="text-xs uppercase text-zinc-600">
                                    New
                                  </p>
                                  <p className="mt-1 font-semibold">
                                    {formatNumber(coverage.new_to_latest_run)}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-zinc-900 p-3">
                                  <p className="text-xs uppercase text-zinc-600">
                                    Disappeared
                                  </p>
                                  <p className="mt-1 font-semibold">
                                    {formatNumber(
                                      coverage.disappeared_from_latest_run,
                                    )}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-zinc-900 p-3">
                                  <p className="text-xs uppercase text-zinc-600">
                                    Matched
                                  </p>
                                  <p className="mt-1 font-semibold">
                                    {formatNumber(coverage.matched_listings)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                                  Top mover
                                </p>

                                {topMover && (
                                  <span className="text-sm font-bold text-white">
                                    {formatDecimal(topMover.signal.score, 1)}
                                  </span>
                                )}
                              </div>

                              {topMover ? (
                                <>
                                  <p className="mt-3 line-clamp-2 font-medium leading-6 text-zinc-200">
                                    {decodeHtml(topMover.title)}
                                  </p>

                                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
                                    <span>
                                      Views{" "}
                                      {formatSignedNumber(
                                        topMover.change.views,
                                      )}
                                    </span>
                                    <span>
                                      Favorites{" "}
                                      {formatSignedNumber(
                                        topMover.change.favorites,
                                      )}
                                    </span>
                                    <span>
                                      Rank{" "}
                                      {formatSignedNumber(
                                        topMover.change.market_rank ??
                                          topMover.change.search_rank,
                                      )}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <p className="mt-3 text-sm text-zinc-500">
                                  No historical mover is available yet.
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              <span>
                                Last collected{" "}
                                {formatCompactDateTime(
                                  market.last_collected_at,
                                )}
                              </span>
                              <span>
                                Next collection{" "}
                                {formatCompactDateTime(
                                  market.next_collection_at,
                                )}
                              </span>
                            </div>

                            {market.latest_run?.id && (
                              <a
                                href={`/research/${market.latest_run.id}`}
                                className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-orange-500 hover:text-orange-400"
                              >
                                View Latest Research →
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {trackedMarketsStatus !== "loading" &&
            filteredTrackedMarkets.length === 0 && (
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                <p className="text-sm text-zinc-500">
                  No tracked markets match this filter yet.
                </p>
              </div>
            )}
        </section>

        {/* =====================================================
            ANALYSIS
        ====================================================== */}

        {analysis && searchStatus === "success" && (
          <>
            {/* =================================================
                MARKET HEADER
            ================================================== */}

            <section className="mt-10">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.16em] text-orange-400">
                    MARKET ANALYSIS
                  </p>

                  <h2 className="mt-2 text-3xl font-bold capitalize">
                    {analysis.keyword}
                  </h2>

                  <p className="mt-2 text-sm text-zinc-500">
                    {analysis.source.name} · U.S. + Canada · Research run #
                    {analysis.research_run_id}
                  </p>
                </div>

                {/* TRACKING */}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {!analysis.tracking.is_tracked && (
                    <select
                      value={trackingFrequency}
                      onChange={(event) =>
                        setTrackingFrequency(
                          event.target.value as TrackingFrequency,
                        )
                      }
                      className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-orange-500"
                    >
                      <option value="daily">Daily</option>

                      <option value="weekly">Weekly</option>

                      <option value="manual">Manual</option>
                    </select>
                  )}

                  {analysis.tracking.is_tracked ? (
                    <button
                      type="button"
                      disabled={trackingBusy}
                      onClick={() => handleTracking("untrack")}
                      className="rounded-xl border border-green-800 bg-green-950/40 px-4 py-2.5 text-sm font-semibold text-green-400 transition hover:bg-green-950/70 disabled:opacity-50"
                    >
                      {trackingBusy ? "Updating..." : "✓ Tracking"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={trackingBusy}
                      onClick={() => handleTracking("track")}
                      className="rounded-xl border border-orange-700 bg-orange-500/10 px-4 py-2.5 text-sm font-semibold text-orange-400 transition hover:bg-orange-500/20 disabled:opacity-50"
                    >
                      {trackingBusy ? "Updating..." : "+ Track Keyword"}
                    </button>
                  )}
                </div>
              </div>

              {trackingMessage && (
                <p className="mt-4 text-sm text-zinc-400">{trackingMessage}</p>
              )}

              {/* PRIMARY METRICS */}

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Competition
                  </p>

                  <p className="mt-3 text-3xl font-bold">
                    {formatNumber(analysis.total_results)}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    Etsy search results
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Median Price
                  </p>

                  <p className="mt-3 text-3xl font-bold">
                    {analysis.market_summary.median_usd_price !== null
                      ? formatPrice(
                          analysis.market_summary.median_usd_price,
                          "USD",
                        )
                      : "—"}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    Relevant USD listings ·{" "}
                    {formatNumber(analysis.market_summary.usd_listing_count)}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Median Views
                  </p>

                  <p className="mt-3 text-3xl font-bold">
                    {formatNumber(analysis.market_summary.median_views)}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    Relevant product sample
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Median Favorites
                  </p>

                  <p className="mt-3 text-3xl font-bold">
                    {formatNumber(analysis.market_summary.median_favorites)}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    Relevant product sample
                  </p>
                </div>
              </div>
            </section>

            {/* =================================================
                MARKET SIGNALS
            ================================================== */}

            <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-400">
                    MARKET SIGNALS
                  </p>

                  <h3 className="mt-1 text-xl font-semibold">
                    Current market structure
                  </h3>
                </div>

                {analysis.relevance && (
                  <p className="text-sm text-zinc-500">
                    {analysis.relevance.relevant} relevant ·{" "}
                    {analysis.relevance.excluded} excluded ·{" "}
                    {analysis.relevance.uncertain} uncertain
                  </p>
                )}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-zinc-950 p-5">
                  <p className="text-sm text-zinc-500">New listings</p>

                  <p className="mt-2 text-2xl font-semibold">
                    {formatNumber(
                      analysis.market_summary.listings_under_30_days,
                    )}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    relevant · created within 30 days
                  </p>
                </div>

                <div className="rounded-xl bg-zinc-950 p-5">
                  <p className="text-sm text-zinc-500">Recent listings</p>

                  <p className="mt-2 text-2xl font-semibold">
                    {formatNumber(
                      analysis.market_summary.listings_under_90_days,
                    )}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    relevant · created within 90 days
                  </p>
                </div>

                <div className="rounded-xl bg-zinc-950 p-5">
                  <p className="text-sm text-zinc-500">Emerging inventory</p>

                  <p className="mt-2 text-2xl font-semibold">
                    {formatNumber(
                      analysis.market_summary.listings_under_180_days,
                    )}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    relevant · created within 6 months
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-zinc-800 pt-5">
                <p className="text-sm leading-6 text-zinc-400">
                  Average engagement among relevant listings is{" "}
                  <span className="font-semibold text-white">
                    {formatNumber(
                      Math.round(analysis.market_summary.average_views ?? 0),
                    )}{" "}
                    views
                  </span>{" "}
                  and{" "}
                  <span className="font-semibold text-white">
                    {formatDecimal(
                      analysis.market_summary.average_favorites,
                      1,
                    )}{" "}
                    favorites
                  </span>
                  . Median engagement is{" "}
                  <span className="font-semibold text-white">
                    {formatNumber(analysis.market_summary.median_views)} views
                  </span>{" "}
                  and{" "}
                  <span className="font-semibold text-white">
                    {formatNumber(analysis.market_summary.median_favorites)}{" "}
                    favorites
                  </span>
                  .
                </p>
              </div>
            </section>

            {/* =================================================
                PRICE LANDSCAPE
            ================================================== */}

            <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <p className="text-sm font-medium text-zinc-500">
                PRICE LANDSCAPE
              </p>

              {/* USD */}

              <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-xl font-semibold">U.S. pricing</h3>

                <span className="text-sm text-zinc-500">
                  {formatNumber(analysis.market_summary.usd_listing_count)}{" "}
                  relevant USD listings
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-zinc-950 p-4">
                  <p className="text-xs uppercase text-zinc-500">Lowest</p>

                  <p className="mt-2 text-xl font-semibold">
                    {analysis.market_summary.lowest_usd_price !== null
                      ? formatPrice(
                          analysis.market_summary.lowest_usd_price,
                          "USD",
                        )
                      : "—"}
                  </p>
                </div>

                <div className="rounded-xl bg-zinc-950 p-4">
                  <p className="text-xs uppercase text-zinc-500">Median</p>

                  <p className="mt-2 text-xl font-semibold">
                    {analysis.market_summary.median_usd_price !== null
                      ? formatPrice(
                          analysis.market_summary.median_usd_price,
                          "USD",
                        )
                      : "—"}
                  </p>
                </div>

                <div className="rounded-xl bg-zinc-950 p-4">
                  <p className="text-xs uppercase text-zinc-500">Average</p>

                  <p className="mt-2 text-xl font-semibold">
                    {analysis.market_summary.average_usd_price !== null
                      ? formatPrice(
                          analysis.market_summary.average_usd_price,
                          "USD",
                        )
                      : "—"}
                  </p>
                </div>

                <div className="rounded-xl bg-zinc-950 p-4">
                  <p className="text-xs uppercase text-zinc-500">Highest</p>

                  <p className="mt-2 text-xl font-semibold">
                    {analysis.market_summary.highest_usd_price !== null
                      ? formatPrice(
                          analysis.market_summary.highest_usd_price,
                          "USD",
                        )
                      : "—"}
                  </p>
                </div>
              </div>

              {/* CANADA — COMPACT */}

              {cadCount > 0 && cadCount < 3 && (
                <div className="mt-6 border-t border-zinc-800 pt-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Canadian pricing
                      </p>

                      <p className="mt-1 text-sm text-zinc-500">
                        Only {cadCount} relevant CAD{" "}
                        {cadCount === 1 ? "listing was" : "listings were"} found
                        in this sample, so a full Canadian price range would not
                        be meaningful yet.
                      </p>
                    </div>

                    <div className="rounded-xl bg-zinc-950 px-5 py-3">
                      <p className="text-xs uppercase text-zinc-500">
                        CAD {cadCount === 1 ? "Price" : "Median"}
                      </p>

                      <p className="mt-1 text-lg font-semibold">
                        {analysis.market_summary.median_cad_price !== null
                          ? formatPrice(
                              analysis.market_summary.median_cad_price,
                              "CAD",
                            )
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CANADA — FULL */}

              {cadCount >= 3 && (
                <div className="mt-8 border-t border-zinc-800 pt-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-semibold">Canadian pricing</h3>

                    <span className="text-sm text-zinc-500">
                      {formatNumber(cadCount)} relevant CAD listings
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl bg-zinc-950 p-4">
                      <p className="text-xs uppercase text-zinc-500">Lowest</p>

                      <p className="mt-2 text-xl font-semibold">
                        {analysis.market_summary.lowest_cad_price !== null
                          ? formatPrice(
                              analysis.market_summary.lowest_cad_price,
                              "CAD",
                            )
                          : "—"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-zinc-950 p-4">
                      <p className="text-xs uppercase text-zinc-500">Median</p>

                      <p className="mt-2 text-xl font-semibold">
                        {analysis.market_summary.median_cad_price !== null
                          ? formatPrice(
                              analysis.market_summary.median_cad_price,
                              "CAD",
                            )
                          : "—"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-zinc-950 p-4">
                      <p className="text-xs uppercase text-zinc-500">Average</p>

                      <p className="mt-2 text-xl font-semibold">
                        {analysis.market_summary.average_cad_price !== null
                          ? formatPrice(
                              analysis.market_summary.average_cad_price,
                              "CAD",
                            )
                          : "—"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-zinc-950 p-4">
                      <p className="text-xs uppercase text-zinc-500">Highest</p>

                      <p className="mt-2 text-xl font-semibold">
                        {analysis.market_summary.highest_cad_price !== null
                          ? formatPrice(
                              analysis.market_summary.highest_cad_price,
                              "CAD",
                            )
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* =================================================
                NEW & RISING
            ================================================== */}

            {risingListings.length > 0 && (
              <section className="mt-8">
                <div>
                  <p className="text-sm font-medium text-orange-400">
                    OPPORTUNITY SIGNAL
                  </p>

                  <h3 className="mt-1 text-xl font-semibold">New & Rising</h3>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                    Relevant newer products showing meaningful engagement
                    velocity compared with other recent listings in this market.
                    Listings must meet a minimum engagement threshold before
                    they can appear here.
                  </p>
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {risingListings.map((listing, index) => (
                    <a
                      key={listing.listing_id}
                      href={listing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:-translate-y-1 hover:border-orange-500/50"
                    >
                      <div className="relative aspect-square overflow-hidden bg-zinc-950">
                        {listing.image_url ? (
                          <img
                            src={listing.image_url}
                            alt={decodeHtml(listing.title)}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                            No image
                          </div>
                        )}

                        <div className="absolute left-3 top-3 rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-black">
                          {index === 0
                            ? "Strongest Signal"
                            : `Rising #${index + 1}`}
                        </div>

                        <div className="absolute bottom-3 right-3 rounded-full bg-black/80 px-2.5 py-1 text-xs font-medium text-white">
                          Etsy #{listing.position}
                        </div>
                      </div>

                      <div className="p-5">
                        <p className="line-clamp-2 min-h-[3rem] font-medium leading-6">
                          {decodeHtml(listing.title)}
                        </p>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span className="font-semibold text-orange-400">
                            {formatPrice(listing.price, listing.currency)}
                          </span>

                          <span className="text-xs text-zinc-500">
                            {getListingAge(listing.original_creation_timestamp)}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-4">
                          <div>
                            <p className="text-xs uppercase text-zinc-600">
                              Views
                            </p>

                            <p className="mt-1 font-semibold">
                              {formatNumber(listing.views)}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-zinc-600">
                              Favorites
                            </p>

                            <p className="mt-1 font-semibold">
                              {formatNumber(listing.favorites)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-1.5">
                          {listing.reasons.map((reason) => (
                            <p
                              key={reason}
                              className="text-xs leading-5 text-zinc-400"
                            >
                              <span className="mr-1.5 text-orange-400">•</span>

                              {reason}
                            </p>
                          ))}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* =================================================
                TRENDING LANGUAGE
            ================================================== */}

            <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-500">
                    TRENDING LANGUAGE
                  </p>

                  <h3 className="mt-1 text-xl font-semibold">
                    Most common relevant Etsy tags
                  </h3>
                </div>

                <span className="text-sm text-zinc-500">
                  Based on {formatNumber(relevantListings.length)} relevant
                  listings
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {topTags.map((item) => (
                  <div
                    key={item.tag}
                    className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-2"
                  >
                    <span className="text-sm text-zinc-300">{item.tag}</span>

                    <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* =================================================
                TOP SEARCH RESULTS
            ================================================== */}

            <section className="mt-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-500">
                    MARKET RESULTS
                  </p>

                  <h3 className="mt-1 text-xl font-semibold">
                    Top Search Results
                  </h3>

                  <p className="mt-1 text-sm text-zinc-500">
                    Raw Etsy search order. Adjacent or excluded products may
                    still appear here.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-500">
                    Showing {displayedListings.length} of{" "}
                    {analysis.results.length}
                  </span>

                  <a
                    href={`/research/${analysis.research_run_id}`}
                    className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-orange-500 hover:text-orange-400"
                  >
                    View All {analysis.results.length} Results
                  </a>
                </div>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {displayedListings.map((listing) => (
                  <a
                    key={listing.listing_id}
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:-translate-y-1 hover:border-zinc-700"
                  >
                    <div className="relative aspect-square overflow-hidden bg-zinc-950">
                      {listing.image_url ? (
                        <img
                          src={listing.image_url}
                          alt={decodeHtml(listing.title)}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                          No image
                        </div>
                      )}

                      <span className="absolute left-3 top-3 rounded-full bg-black/80 px-2.5 py-1 text-xs font-semibold">
                        #{listing.position}
                      </span>

                      {listing.relevance_status === "excluded" && (
                        <span className="absolute right-3 top-3 rounded-full bg-red-950/90 px-2.5 py-1 text-xs font-medium text-red-300">
                          Excluded
                        </span>
                      )}

                      {listing.relevance_status === "uncertain" && (
                        <span className="absolute right-3 top-3 rounded-full bg-amber-950/90 px-2.5 py-1 text-xs font-medium text-amber-300">
                          Uncertain
                        </span>
                      )}
                    </div>

                    <div className="p-4">
                      <p className="line-clamp-2 min-h-[3rem] font-medium leading-6">
                        {decodeHtml(listing.title)}
                      </p>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-lg font-semibold text-orange-400">
                          {formatPrice(listing.price, listing.currency)}
                        </span>

                        <span className="text-xs text-zinc-500">
                          {getListingAge(listing.original_creation_timestamp)}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-800 pt-4">
                        <div>
                          <p className="text-xs uppercase text-zinc-600">
                            Views
                          </p>

                          <p className="mt-1 text-sm font-medium">
                            {formatNumber(listing.views)}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase text-zinc-600">
                            Favorites
                          </p>

                          <p className="mt-1 text-sm font-medium">
                            {formatNumber(listing.favorites)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
