"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type ListingImage = {
  listing_id: number;
  image_rank: number;
  url_75: string | null;
  url_170: string | null;
  url_570: string | null;
  url_full: string | null;
  alt_text: string | null;
};

type ResearchListing = {
  position: number;
  internal_listing_id: number;
  listing_id: number | null;
  shop_id: number | null;
  title: string;
  url: string | null;
  image_url: string | null;
  images: ListingImage[];
  price: number | null;
  currency: string | null;
  views: number | null;
  favorites: number | null;
  quantity: number | null;
  state: string | null;
  original_creation_timestamp: number | null;
  updated_timestamp: number | null;
  observed_at: string | null;
  tags: string[];
};

type Keyword = {
  id: number;
  keyword: string;
  category: string | null;
};

type MarketSource = {
  id: number;
  code: string;
  name: string;
};

type ResearchRun = {
  id: number;
  run_type: string;
  total_result_count: number | null;
  requested_limit: number | null;
  returned_count: number | null;
  started_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  keyword: Keyword | Keyword[] | null;
  source: MarketSource | MarketSource[] | null;
};

type ResearchResponse = {
  success: boolean;
  research_run: ResearchRun;
  market_summary: unknown;
  trending_tags: unknown[];
  result_count: number;
  results: ResearchListing[];
};

type SortOption =
  | "rank"
  | "views"
  | "favorites"
  | "newest"
  | "oldest"
  | "price-low"
  | "price-high";

const RESULTS_PER_PAGE = 24;

function firstRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null;

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatPrice(price: number | null, currency: string | null) {
  if (price === null) {
    return "Price unavailable";
  }

  if (!currency) {
    return price.toFixed(2);
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

function formatDate(dateString: string | null) {
  if (!dateString) return "Unknown date";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function listingAge(timestamp: number | null) {
  if (!timestamp) {
    return "Age unknown";
  }

  const created = new Date(timestamp * 1000);

  if (Number.isNaN(created.getTime())) {
    return "Age unknown";
  }

  const now = Date.now();
  const difference = Math.max(0, now - created.getTime());

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

export default function ResearchResultsPage() {
  const params = useParams();

  const runId = Array.isArray(params.runId) ? params.runId[0] : params.runId;

  const [data, setData] = useState<ResearchResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [sort, setSort] = useState<SortOption>("rank");

  const [visibleCount, setVisibleCount] = useState(RESULTS_PER_PAGE);

  useEffect(() => {
    if (!runId) return;

    async function loadResearch() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/research/${runId}`, {
          cache: "no-store",
        });

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(
            responseData.error || "Unable to load research results.",
          );
        }

        setData(responseData);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load research results.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadResearch();
  }, [runId]);

  useEffect(() => {
    setVisibleCount(RESULTS_PER_PAGE);
  }, [sort]);

  const sortedResults = useMemo(() => {
    if (!data) {
      return [];
    }

    const results = [...data.results];

    switch (sort) {
      case "views":
        return results.sort((a, b) => (b.views ?? -1) - (a.views ?? -1));

      case "favorites":
        return results.sort(
          (a, b) => (b.favorites ?? -1) - (a.favorites ?? -1),
        );

      case "newest":
        return results.sort(
          (a, b) =>
            (b.original_creation_timestamp ?? 0) -
            (a.original_creation_timestamp ?? 0),
        );

      case "oldest":
        return results.sort(
          (a, b) =>
            (a.original_creation_timestamp ?? Number.MAX_SAFE_INTEGER) -
            (b.original_creation_timestamp ?? Number.MAX_SAFE_INTEGER),
        );

      case "price-low":
        return results.sort(
          (a, b) =>
            (a.price ?? Number.MAX_SAFE_INTEGER) -
            (b.price ?? Number.MAX_SAFE_INTEGER),
        );

      case "price-high":
        return results.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));

      case "rank":
      default:
        return results.sort((a, b) => a.position - b.position);
    }
  }, [data, sort]);

  const visibleResults = sortedResults.slice(0, visibleCount);

  const hasMore = visibleCount < sortedResults.length;

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-400">
            TrendForge Research
          </p>

          <h1 className="mt-3 text-3xl font-bold">Loading research...</h1>

          <p className="mt-3 text-zinc-500">
            Retrieving the saved marketplace analysis.
          </p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400">
            Research Error
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Unable to load this research run
          </h1>

          <p className="mt-3 text-zinc-400">
            {error || "The requested research run could not be loaded."}
          </p>

          <a
            href={runId ? `/?run=${runId}` : "/"}
            className="mt-8 inline-flex rounded-xl bg-orange-500 px-5 py-3 font-semibold text-black transition hover:bg-orange-400"
          >
            Return to TrendForge
          </a>
        </div>
      </main>
    );
  }

  const keyword = firstRelation(data.research_run.keyword);

  const source = firstRelation(data.research_run.source);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* HEADER */}

        <header>
          <a
            href={`/?run=${data.research_run.id}`}
            className="text-sm text-zinc-500 transition hover:text-orange-400"
          >
            ← Back to TrendForge
          </a>

          <div className="mt-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-400">
                Market Research
              </p>

              <h1 className="mt-2 text-4xl font-bold capitalize">
                {keyword?.keyword ?? "Research Results"}
              </h1>

              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-500">
                <span>{source?.name ?? "Marketplace"}</span>

                <span>•</span>

                <span>Research Run #{data.research_run.id}</span>

                <span>•</span>

                <span>
                  {formatDate(
                    data.research_run.completed_at ??
                      data.research_run.started_at,
                  )}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Analyzed
                </p>

                <p className="mt-1 text-xl font-semibold">
                  {formatNumber(
                    data.research_run.returned_count ?? data.result_count,
                  )}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-3">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Marketplace Results
                </p>

                <p className="mt-1 text-xl font-semibold">
                  {formatNumber(data.research_run.total_result_count)}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* CONTROLS */}

        <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold">All Results</p>

              <p className="mt-1 text-sm text-zinc-500">
                Showing {visibleResults.length} of {data.result_count} saved
                listings.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label htmlFor="sort" className="text-sm text-zinc-500">
                Sort by
              </label>

              <select
                id="sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortOption)}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-orange-500"
              >
                <option value="rank">Search Rank</option>

                <option value="views">Most Views</option>

                <option value="favorites">Most Favorites</option>

                <option value="newest">Newest</option>

                <option value="oldest">Oldest</option>

                <option value="price-low">Price: Low to High</option>

                <option value="price-high">Price: High to Low</option>
              </select>
            </div>
          </div>
        </section>

        {/* RESULTS */}

        {visibleResults.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-zinc-400">
              No listings were saved for this research run.
            </p>
          </div>
        ) : (
          <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleResults.map((listing) => {
              const card = (
                <>
                  <div className="relative aspect-square overflow-hidden bg-zinc-950">
                    {listing.image_url ? (
                      <img
                        src={listing.image_url}
                        alt={listing.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-600">
                        Image unavailable
                      </div>
                    )}

                    <span className="absolute left-3 top-3 rounded-full bg-black/80 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                      #{listing.position}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="line-clamp-2 text-base font-semibold leading-6 text-white">
                      {listing.title || "Untitled listing"}
                    </h2>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-lg font-bold text-orange-400">
                        {formatPrice(listing.price, listing.currency)}
                      </p>

                      <p className="text-xs text-zinc-500">
                        {listingAge(listing.original_creation_timestamp)}
                      </p>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-zinc-600">
                          Views
                        </p>

                        <p className="mt-1 font-semibold">
                          {formatNumber(listing.views)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-zinc-600">
                          Favorites
                        </p>

                        <p className="mt-1 font-semibold">
                          {formatNumber(listing.favorites)}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              );

              if (!listing.url) {
                return (
                  <article
                    key={listing.internal_listing_id}
                    className="group flex overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
                  >
                    <div className="flex w-full flex-col">{card}</div>
                  </article>
                );
              }

              return (
                <a
                  key={listing.internal_listing_id}
                  href={listing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition hover:-translate-y-1 hover:border-zinc-700"
                >
                  <div className="flex w-full flex-col">{card}</div>
                </a>
              );
            })}
          </section>
        )}

        {/* LOAD MORE */}

        {hasMore && (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={() =>
                setVisibleCount((current) =>
                  Math.min(current + RESULTS_PER_PAGE, sortedResults.length),
                )
              }
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-8 py-3 font-semibold text-white transition hover:border-orange-500 hover:text-orange-400"
            >
              Load More Results
            </button>
          </div>
        )}

        {!hasMore && sortedResults.length > RESULTS_PER_PAGE && (
          <p className="mt-10 text-center text-sm text-zinc-600">
            All {sortedResults.length} results are displayed.
          </p>
        )}
      </div>
    </main>
  );
}
