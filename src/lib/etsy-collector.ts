import { supabaseAdmin } from "@/lib/supabase-admin";

/*
 * ============================================================
 * PUBLIC TYPES
 * ============================================================
 */

export type EtsyCollectionRunType = "manual" | "scheduled";

export type RelevanceStatus =
  | "relevant"
  | "excluded"
  | "uncertain"
  | "unclassified";

export type ProductType =
  | "apparel"
  | "digital_design"
  | "mug"
  | "decal"
  | "poster"
  | "other"
  | "unknown";

export type SearchIntent =
  | "apparel"
  | "digital_design"
  | "mug"
  | "decal"
  | "poster"
  | "generic";

export type CollectEtsyKeywordOptions = {
  keyword: string;

  /*
   * Manual = search initiated by the dashboard.
   * Scheduled = automatic tracked-keyword collection.
   */
  runType?: EtsyCollectionRunType;
};

export type EtsyCollectorResult = {
  success: true;

  keyword: string;
  keyword_id: number;

  source: {
    id: number;
    code: string;
    name: string;
  };

  market: {
    code: "US_CA";
    currencies: ["USD", "CAD"];
    target_results: number;
    examined_results: number;
    pages_fetched: number;
  };

  relevance: {
    search_intent: SearchIntent;
    model: "deterministic_v1";
    collected: number;
    relevant: number;
    uncertain: number;
    excluded: number;
  };

  tracking: {
    is_tracked: boolean;
    tracked_keyword_id: number | null;
    frequency: string | null;
  };

  research_run_id: number;

  total_results: number;
  requested_results: number;
  stored_results: number;

  market_summary: {
    research_run_id: number;
    keyword_id: number;
    source_id: number;

    total_result_count: number;

    usd_listing_count: number;
    lowest_usd_price: number | null;
    median_usd_price: number | null;
    average_usd_price: number | null;
    highest_usd_price: number | null;

    cad_listing_count: number;
    lowest_cad_price: number | null;
    median_cad_price: number | null;
    average_cad_price: number | null;
    highest_cad_price: number | null;

    median_views: number | null;
    average_views: number | null;

    median_favorites: number | null;
    average_favorites: number | null;

    listings_under_30_days: number;
    listings_under_90_days: number;
    listings_under_180_days: number;
  };

  results: StoredResult[];
};

/*
 * ============================================================
 * COLLECTOR ERROR
 * ============================================================
 *
 * The shared collector should not return NextResponse objects.
 *
 * Manual API routes, scheduled routes, and future background
 * jobs can decide how they want to translate these errors into
 * HTTP responses or logs.
 */

export class EtsyCollectorError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);

    this.name = "EtsyCollectorError";
    this.status = status;
    this.details = details;
  }
}

/*
 * ============================================================
 * INTERNAL ETSY TYPES
 * ============================================================
 */

type EtsyMoney = {
  amount: number;
  divisor: number;
  currency_code: string;
};

type EtsyImage = {
  listing_image_id: number;
  rank: number;

  url_75x75?: string;
  url_170x135?: string;
  url_570xN?: string;
  url_fullxfull?: string;

  alt_text?: string;
};

type EtsyListing = {
  listing_id: number;
  shop_id: number;

  title: string;
  state: string;

  quantity: number;

  url: string;

  num_favorers: number;
  views?: number;

  original_creation_timestamp?: number;
  updated_timestamp?: number;

  price?: EtsyMoney;

  tags?: string[];
  images?: EtsyImage[];
};

type QualifiedListing = EtsyListing & {
  /*
   * True position in the original Etsy search.
   */
  source_position: number;

  /*
   * Position after USD/CAD filtering.
   */
  market_position: number;
};

type StoredListing = {
  id: number;
  external_listing_id: string;
};

type RelevanceClassification = {
  status: RelevanceStatus;
  productType: ProductType;
  reason: string;
};

type ClassifiedListing = QualifiedListing & {
  relevance: RelevanceClassification;
};

type StoredResult = {
  position: number;
  market_position: number;

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

  relevance_status: RelevanceStatus;
  relevance_reason: string;
  product_type: ProductType;
};

/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const SOURCE_CODE = "etsy";

const TARGET_RESULTS = 100;
const PAGE_SIZE = 100;

const MAX_SEARCH_PAGES = 10;

const BULK_CHUNK_SIZE = 500;

const ALLOWED_CURRENCIES = new Set(["USD", "CAD"]);

/*
 * ============================================================
 * PRODUCT CLASSIFICATION
 * ============================================================
 */

const APPAREL_TERMS = [
  "shirt",
  "shirts",
  "t-shirt",
  "t shirt",
  "tshirt",
  "tee",
  "tees",
  "sweatshirt",
  "sweatshirts",
  "crewneck",
  "crew neck",
  "hoodie",
  "hoodies",
  "tank top",
  "tank",
  "comfort colors",
  "comfort color",
  "gildan",
  "bella canvas",
  "bella + canvas",
  "jerzees",
  "garment dyed",
  "garment-dyed",
];

const DIGITAL_TERMS = [
  "svg",
  "png",
  "dxf",
  "eps",
  "ai file",
  "cut file",
  "cut files",
  "digital file",
  "digital files",
  "digital download",
  "digital downloads",
  "instant download",
  "instant downloads",
  "clipart",
  "clip art",
  "printable",
  "printables",
  "sublimation",
  "sublimation design",
  "cricut",
  "silhouette file",
  "vector file",
  "vector files",
];

const MUG_TERMS = [
  "mug",
  "mugs",
  "coffee mug",
  "coffee mugs",
  "tumbler",
  "tumblers",
];

const DECAL_TERMS = [
  "decal",
  "decals",
  "sticker",
  "stickers",
  "vinyl decal",
  "car decal",
];

const POSTER_TERMS = [
  "poster",
  "posters",
  "wall art",
  "wall decor",
  "art print",
  "art prints",
  "canvas print",
];

/*
 * ============================================================
 * STATISTICAL HELPERS
 * ============================================================
 */

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

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

/*
 * ============================================================
 * CLASSIFICATION HELPERS
 * ============================================================
 */

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[|,/()[\]{}:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesTerm(text: string, term: string) {
  const normalizedTerm = normalizeText(term);

  /*
   * Short technical terms such as:
   *
   * SVG
   * PNG
   * DXF
   * EPS
   *
   * should be matched as complete words rather than random
   * substrings.
   */

  if (normalizedTerm.length <= 3) {
    const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(text);
  }

  return text.includes(normalizedTerm);
}

function findMatches(text: string, terms: string[]) {
  return terms.filter((term) => includesTerm(text, term));
}

function detectSearchIntent(keyword: string): SearchIntent {
  const normalized = normalizeText(keyword);

  if (findMatches(normalized, APPAREL_TERMS).length > 0) {
    return "apparel";
  }

  if (findMatches(normalized, DIGITAL_TERMS).length > 0) {
    return "digital_design";
  }

  if (findMatches(normalized, MUG_TERMS).length > 0) {
    return "mug";
  }

  if (findMatches(normalized, DECAL_TERMS).length > 0) {
    return "decal";
  }

  if (findMatches(normalized, POSTER_TERMS).length > 0) {
    return "poster";
  }

  return "generic";
}

function classifyListing(
  listing: EtsyListing,
  searchIntent: SearchIntent,
): RelevanceClassification {
  const title = normalizeText(listing.title ?? "");

  const tags = normalizeText((listing.tags ?? []).join(" "));

  const searchableText = `${title} ${tags}`.trim();

  const apparelMatches = findMatches(searchableText, APPAREL_TERMS);

  const digitalMatches = findMatches(searchableText, DIGITAL_TERMS);

  const mugMatches = findMatches(searchableText, MUG_TERMS);

  const decalMatches = findMatches(searchableText, DECAL_TERMS);

  const posterMatches = findMatches(searchableText, POSTER_TERMS);

  /*
   * ==========================================================
   * APPAREL
   * ==========================================================
   */

  if (searchIntent === "apparel") {
    if (digitalMatches.length > 0) {
      return {
        status: "excluded",

        productType: "digital_design",

        reason: `Digital product signal: "${digitalMatches[0]}"`,
      };
    }

    if (mugMatches.length > 0) {
      return {
        status: "excluded",

        productType: "mug",

        reason: `Non-apparel product signal: "${mugMatches[0]}"`,
      };
    }

    if (decalMatches.length > 0) {
      return {
        status: "excluded",

        productType: "decal",

        reason: `Non-apparel product signal: "${decalMatches[0]}"`,
      };
    }

    if (posterMatches.length > 0) {
      return {
        status: "excluded",

        productType: "poster",

        reason: `Non-apparel product signal: "${posterMatches[0]}"`,
      };
    }

    if (apparelMatches.length > 0) {
      return {
        status: "relevant",

        productType: "apparel",

        reason: `Apparel signal: "${apparelMatches[0]}"`,
      };
    }

    return {
      status: "uncertain",

      productType: "unknown",

      reason: "No strong apparel or conflicting product-type signal found.",
    };
  }

  /*
   * ==========================================================
   * DIGITAL DESIGN
   * ==========================================================
   */

  if (searchIntent === "digital_design") {
    if (digitalMatches.length > 0) {
      return {
        status: "relevant",

        productType: "digital_design",

        reason: `Digital product signal: "${digitalMatches[0]}"`,
      };
    }

    if (apparelMatches.length > 0) {
      return {
        status: "excluded",

        productType: "apparel",

        reason: `Physical apparel signal: "${apparelMatches[0]}"`,
      };
    }

    return {
      status: "uncertain",

      productType: "unknown",

      reason: "No strong digital-design product signal found.",
    };
  }

  /*
   * ==========================================================
   * MUG
   * ==========================================================
   */

  if (searchIntent === "mug") {
    if (digitalMatches.length > 0) {
      return {
        status: "excluded",

        productType: "digital_design",

        reason: `Digital product signal: "${digitalMatches[0]}"`,
      };
    }

    if (mugMatches.length > 0) {
      return {
        status: "relevant",

        productType: "mug",

        reason: `Mug product signal: "${mugMatches[0]}"`,
      };
    }

    if (apparelMatches.length > 0) {
      return {
        status: "excluded",

        productType: "apparel",

        reason: `Non-mug apparel signal: "${apparelMatches[0]}"`,
      };
    }

    return {
      status: "uncertain",

      productType: "unknown",

      reason: "No strong mug or conflicting product-type signal found.",
    };
  }

  /*
   * ==========================================================
   * DECAL
   * ==========================================================
   */

  if (searchIntent === "decal") {
    if (digitalMatches.length > 0) {
      return {
        status: "excluded",

        productType: "digital_design",

        reason: `Digital product signal: "${digitalMatches[0]}"`,
      };
    }

    if (decalMatches.length > 0) {
      return {
        status: "relevant",

        productType: "decal",

        reason: `Decal product signal: "${decalMatches[0]}"`,
      };
    }

    return {
      status: "uncertain",

      productType: "unknown",

      reason: "No strong decal or conflicting product-type signal found.",
    };
  }

  /*
   * ==========================================================
   * POSTER
   * ==========================================================
   */

  if (searchIntent === "poster") {
    if (digitalMatches.length > 0) {
      return {
        status: "excluded",

        productType: "digital_design",

        reason: `Digital product signal: "${digitalMatches[0]}"`,
      };
    }

    if (posterMatches.length > 0) {
      return {
        status: "relevant",

        productType: "poster",

        reason: `Poster product signal: "${posterMatches[0]}"`,
      };
    }

    return {
      status: "uncertain",

      productType: "unknown",

      reason: "No strong poster or conflicting product-type signal found.",
    };
  }

  /*
   * ==========================================================
   * GENERIC SEARCH
   * ==========================================================
   *
   * A generic keyword such as "bigfoot" does not establish
   * a specific product category, so we keep all categories
   * relevant while still identifying their product type.
   */

  if (digitalMatches.length > 0) {
    return {
      status: "relevant",

      productType: "digital_design",

      reason: `Broad search; digital product signal: "${digitalMatches[0]}"`,
    };
  }

  if (apparelMatches.length > 0) {
    return {
      status: "relevant",

      productType: "apparel",

      reason: `Broad search; apparel signal: "${apparelMatches[0]}"`,
    };
  }

  if (mugMatches.length > 0) {
    return {
      status: "relevant",

      productType: "mug",

      reason: `Broad search; mug signal: "${mugMatches[0]}"`,
    };
  }

  if (decalMatches.length > 0) {
    return {
      status: "relevant",

      productType: "decal",

      reason: `Broad search; decal signal: "${decalMatches[0]}"`,
    };
  }

  if (posterMatches.length > 0) {
    return {
      status: "relevant",

      productType: "poster",

      reason: `Broad search; poster signal: "${posterMatches[0]}"`,
    };
  }

  return {
    status: "relevant",

    productType: "other",

    reason: "Broad search with no conflicting product-type restriction.",
  };
}

/*
 * ============================================================
 * ETSY FETCH HELPER
 * ============================================================
 */

async function fetchEtsyJson(
  url: string,
  headers: Record<string, string>,
  errorMessage: string,
) {
  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error(errorMessage, data);

    throw new EtsyCollectorError(errorMessage, response.status, data);
  }

  return data as {
    count?: number;
    results?: EtsyListing[];
  };
}

/*
 * ============================================================
 * MAIN SHARED COLLECTOR
 * ============================================================
 */

export async function collectEtsyKeyword(
  options: CollectEtsyKeywordOptions,
): Promise<EtsyCollectorResult> {
  const keyword = options.keyword.trim();

  const runType = options.runType ?? "manual";

  if (!keyword) {
    throw new EtsyCollectorError("A keyword is required.", 400);
  }

  const apiKey = process.env.ETSY_API_KEY;

  const sharedSecret = process.env.ETSY_SHARED_SECRET;

  if (!apiKey || !sharedSecret) {
    throw new EtsyCollectorError(
      "Etsy API credentials are not configured.",
      500,
    );
  }

  const normalizedKeyword = keyword.toLowerCase();

  const searchIntent = detectSearchIntent(normalizedKeyword);

  const etsyHeaders = {
    "x-api-key": `${apiKey}:${sharedSecret}`,

    Accept: "application/json",
  };

  /*
   * If anything fails after the run record has been created,
   * we mark that run as failed.
   */

  let activeResearchRunId: number | null = null;

  try {
    /*
     * ========================================================
     * 1. SOURCE + KEYWORD
     * ========================================================
     */

    const [sourceResult, keywordResult] = await Promise.all([
      supabaseAdmin
        .from("market_sources")
        .select("id, code, name")
        .eq("code", SOURCE_CODE)
        .single(),

      supabaseAdmin
        .from("keywords")
        .select("*")
        .eq("keyword", normalizedKeyword)
        .maybeSingle(),
    ]);

    if (sourceResult.error || !sourceResult.data) {
      console.error("Market source lookup failed:", {
        error: sourceResult.error,

        data: sourceResult.data,
      });

      throw new EtsyCollectorError(
        sourceResult.error?.message ||
          "The Etsy market source could not be found.",
        500,
        sourceResult.error,
      );
    }

    const source = sourceResult.data;

    if (keywordResult.error) {
      throw keywordResult.error;
    }

    let keywordRecord = keywordResult.data;

    /*
     * New keywords can still be created automatically from a
     * manual search.
     *
     * Scheduled searches should normally already have a keyword
     * row because tracked_keywords references one, but keeping
     * this behavior in the shared engine makes it robust.
     */

    if (!keywordRecord) {
      const {
        data: createdKeyword,

        error: createKeywordError,
      } = await supabaseAdmin
        .from("keywords")
        .insert({
          keyword: normalizedKeyword,
        })
        .select()
        .single();

      if (createKeywordError) {
        throw createKeywordError;
      }

      keywordRecord = createdKeyword;
    }

    /*
     * ========================================================
     * 2. COLLECT 100 USD/CAD RESULTS
     * ========================================================
     *
     * We do not remove irrelevant product types here.
     *
     * TrendForge stores the real marketplace sample first and
     * then decides which listings belong in product analytics.
     */

    const qualifyingListings: QualifiedListing[] = [];

    const seenListingIds = new Set<number>();

    let totalEtsyResults = 0;
    let examinedCount = 0;
    let pagesFetched = 0;
    let offset = 0;

    while (
      qualifyingListings.length < TARGET_RESULTS &&
      pagesFetched < MAX_SEARCH_PAGES
    ) {
      const searchParams = new URLSearchParams({
        keywords: keyword,

        limit: String(PAGE_SIZE),

        offset: String(offset),

        sort_on: "score",

        sort_order: "desc",
      });

      const searchData = await fetchEtsyJson(
        `https://api.etsy.com/v3/application/listings/active?${searchParams.toString()}`,

        etsyHeaders,

        "Etsy marketplace search failed.",
      );

      pagesFetched++;

      if (pagesFetched === 1) {
        totalEtsyResults = searchData.count ?? 0;
      }

      const pageResults = searchData.results ?? [];

      if (pageResults.length === 0) {
        break;
      }

      for (let index = 0; index < pageResults.length; index++) {
        const listing = pageResults[index];

        const sourcePosition = offset + index + 1;

        examinedCount++;

        if (seenListingIds.has(listing.listing_id)) {
          continue;
        }

        seenListingIds.add(listing.listing_id);

        const currency = listing.price?.currency_code;

        if (!currency || !ALLOWED_CURRENCIES.has(currency)) {
          continue;
        }

        qualifyingListings.push({
          ...listing,

          source_position: sourcePosition,

          market_position: qualifyingListings.length + 1,
        });

        if (qualifyingListings.length >= TARGET_RESULTS) {
          break;
        }
      }

      if (pageResults.length < PAGE_SIZE) {
        break;
      }

      offset += PAGE_SIZE;

      if (totalEtsyResults > 0 && offset >= totalEtsyResults) {
        break;
      }
    }

    /*
     * ========================================================
     * 3. IMAGE ENRICHMENT
     * ========================================================
     */

    const listingIds = qualifyingListings
      .map((listing) => listing.listing_id)
      .join(",");

    let enrichedListings: QualifiedListing[] = qualifyingListings;

    if (listingIds) {
      const batchParams = new URLSearchParams({
        listing_ids: listingIds,

        includes: "Images",
      });

      const batchData = await fetchEtsyJson(
        `https://api.etsy.com/v3/application/listings/batch?${batchParams.toString()}`,

        etsyHeaders,

        "Etsy listing enrichment failed.",
      );

      const batchListings = batchData.results ?? [];

      const batchMap = new Map(
        batchListings.map((listing) => [listing.listing_id, listing]),
      );

      enrichedListings = qualifyingListings.map((searchListing) => {
        const enriched = batchMap.get(searchListing.listing_id);

        if (!enriched) {
          return searchListing;
        }

        return {
          ...searchListing,
          ...enriched,

          /*
           * Etsy's enrichment result should not overwrite
           * the positions determined from the actual
           * search response.
           */

          source_position: searchListing.source_position,

          market_position: searchListing.market_position,
        };
      });
    }

    /*
     * ========================================================
     * 4. PRODUCT RELEVANCE
     * ========================================================
     */

    const classifiedListings: ClassifiedListing[] = enrichedListings.map(
      (listing) => ({
        ...listing,

        relevance: classifyListing(listing, searchIntent),
      }),
    );

    const relevantListings = classifiedListings.filter(
      (listing) => listing.relevance.status === "relevant",
    );

    const uncertainListings = classifiedListings.filter(
      (listing) => listing.relevance.status === "uncertain",
    );

    const excludedListings = classifiedListings.filter(
      (listing) => listing.relevance.status === "excluded",
    );

    /*
     * ========================================================
     * 5. CREATE RESEARCH RUN
     * ========================================================
     */

    const {
      data: researchRun,

      error: researchRunError,
    } = await supabaseAdmin
      .from("research_runs")
      .insert({
        keyword_id: keywordRecord.id,

        source_id: source.id,

        /*
         * THIS is the key change that makes the collector
         * usable by both manual and automatic collection.
         */
        run_type: runType,

        total_result_count: totalEtsyResults,

        requested_limit: TARGET_RESULTS,

        returned_count: classifiedListings.length,

        allowed_currencies: ["USD", "CAD"],

        examined_count: examinedCount,

        pages_fetched: pagesFetched,

        status: "running",

        metadata: {
          sort_on: "score",

          sort_order: "desc",

          endpoint: "listings/active",

          market_scope: "US_CA",

          currencies: ["USD", "CAD"],

          target_result_count: TARGET_RESULTS,

          max_search_pages: MAX_SEARCH_PAGES,

          total_result_count_scope: "etsy_all_currencies",

          search_intent: searchIntent,

          relevance_model: "deterministic_v1",

          collected_listing_count: classifiedListings.length,

          relevant_listing_count: relevantListings.length,

          uncertain_listing_count: uncertainListings.length,

          excluded_listing_count: excludedListings.length,

          collection_trigger: runType,
        },
      })
      .select()
      .single();

    if (researchRunError) {
      throw researchRunError;
    }

    activeResearchRunId = researchRun.id;

    /*
     * ========================================================
     * 6. ANALYSIS ACCUMULATORS
     * ========================================================
     */

    const usdPrices: number[] = [];

    const cadPrices: number[] = [];

    const viewValues: number[] = [];

    const favoriteValues: number[] = [];

    let listingsUnder30Days = 0;

    let listingsUnder90Days = 0;

    let listingsUnder180Days = 0;

    const tagCounts = new Map<string, number>();

    const now = Date.now();

    const nowIso = new Date().toISOString();

    /*
     * ========================================================
     * 7. PERMANENT LISTING ROWS + MARKET METRICS
     * ========================================================
     */

    const listingRows = classifiedListings.map((listing) => {
      const price = listing.price
        ? listing.price.amount / listing.price.divisor
        : null;

      const currency = listing.price?.currency_code ?? null;

      /*
       * Only relevant listings influence product-market
       * statistics.
       */

      if (listing.relevance.status === "relevant") {
        if (price !== null && currency === "USD") {
          usdPrices.push(price);
        }

        if (price !== null && currency === "CAD") {
          cadPrices.push(price);
        }

        if (listing.views !== null && listing.views !== undefined) {
          viewValues.push(listing.views);
        }

        favoriteValues.push(listing.num_favorers ?? 0);

        if (listing.original_creation_timestamp) {
          const createdAt = listing.original_creation_timestamp * 1000;

          const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);

          if (ageDays >= 0 && ageDays <= 30) {
            listingsUnder30Days++;
          }

          if (ageDays >= 0 && ageDays <= 90) {
            listingsUnder90Days++;
          }

          if (ageDays >= 0 && ageDays <= 180) {
            listingsUnder180Days++;
          }
        }

        const uniqueTags = new Set(
          (listing.tags ?? [])
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        );

        for (const tag of uniqueTags) {
          tagCounts.set(
            tag,

            (tagCounts.get(tag) ?? 0) + 1,
          );
        }
      }

      return {
        source_id: source.id,

        external_listing_id: String(listing.listing_id),

        external_shop_id:
          listing.shop_id !== null && listing.shop_id !== undefined
            ? String(listing.shop_id)
            : null,

        title: listing.title,

        url: listing.url,

        currency_code: currency,

        original_creation_timestamp:
          listing.original_creation_timestamp ?? null,

        tags: listing.tags ?? [],

        raw_metadata: {
          state: listing.state ?? null,

          quantity: listing.quantity ?? null,

          updated_timestamp: listing.updated_timestamp ?? null,
        },

        last_seen_at: nowIso,
      };
    });

    /*
     * ========================================================
     * 8. UPSERT PERMANENT LISTINGS
     * ========================================================
     */

    let storedListings: StoredListing[] = [];

    if (listingRows.length > 0) {
      const {
        data,

        error: listingUpsertError,
      } = await supabaseAdmin
        .from("listings")
        .upsert(listingRows, {
          onConflict: "source_id,external_listing_id",
        })
        .select("id, external_listing_id");

      if (listingUpsertError) {
        throw listingUpsertError;
      }

      storedListings = (data ?? []) as StoredListing[];
    }

    /*
     * ========================================================
     * 9. INTERNAL LISTING ID MAP
     * ========================================================
     */

    const listingIdMap = new Map<string, number>();

    for (const storedListing of storedListings) {
      listingIdMap.set(storedListing.external_listing_id, storedListing.id);
    }

    /*
     * ========================================================
     * 10. RELATED ROWS
     * ========================================================
     */

    const imageRows: {
      listing_id: number;
      external_image_id: string | null;
      image_rank: number;

      url_75: string | null;

      url_170: string | null;

      url_570: string | null;

      url_full: string | null;

      alt_text: string | null;

      updated_at: string;
    }[] = [];

    const runListingRows: {
      research_run_id: number;

      listing_id: number;

      search_position: number;

      market_position: number;

      relevance_status: RelevanceStatus;

      relevance_reason: string | null;

      product_type: ProductType | null;
    }[] = [];

    const snapshotRows: {
      research_run_id: number;

      listing_id: number;

      keyword_id: number;

      search_position: number;

      market_position: number;

      price: number | null;

      currency_code: string | null;

      views: number | null;

      favorites: number;

      quantity: number | null;

      state: string | null;

      original_creation_timestamp: number | null;

      updated_timestamp: number | null;
    }[] = [];

    const storedResults: StoredResult[] = [];

    for (const listing of classifiedListings) {
      const internalListingId = listingIdMap.get(String(listing.listing_id));

      if (!internalListingId) {
        throw new Error(
          `Internal listing ID missing for Etsy listing ${listing.listing_id}.`,
        );
      }

      const price = listing.price
        ? listing.price.amount / listing.price.divisor
        : null;

      const currency = listing.price?.currency_code ?? null;

      /*
       * ---------------------------
       * IMAGES
       * ---------------------------
       */

      const sortedImages = [...(listing.images ?? [])].sort(
        (a, b) => a.rank - b.rank,
      );

      for (const image of sortedImages) {
        imageRows.push({
          listing_id: internalListingId,

          external_image_id: image.listing_image_id
            ? String(image.listing_image_id)
            : null,

          image_rank: image.rank ?? 1,

          url_75: image.url_75x75 ?? null,

          url_170: image.url_170x135 ?? null,

          url_570: image.url_570xN ?? null,

          url_full: image.url_fullxfull ?? null,

          alt_text: image.alt_text ?? null,

          updated_at: nowIso,
        });
      }

      /*
       * ---------------------------
       * RESEARCH RUN LISTING
       * ---------------------------
       */

      runListingRows.push({
        research_run_id: researchRun.id,

        listing_id: internalListingId,

        search_position: listing.source_position,

        market_position: listing.market_position,

        relevance_status: listing.relevance.status,

        relevance_reason: listing.relevance.reason,

        product_type: listing.relevance.productType,
      });

      /*
       * ---------------------------
       * HISTORICAL SNAPSHOT
       * ---------------------------
       */

      snapshotRows.push({
        research_run_id: researchRun.id,

        listing_id: internalListingId,

        keyword_id: keywordRecord.id,

        search_position: listing.source_position,

        market_position: listing.market_position,

        price,

        currency_code: currency,

        views: listing.views ?? null,

        favorites: listing.num_favorers ?? 0,

        quantity: listing.quantity ?? null,

        state: listing.state ?? null,

        original_creation_timestamp:
          listing.original_creation_timestamp ?? null,

        updated_timestamp: listing.updated_timestamp ?? null,
      });

      /*
       * ---------------------------
       * RESULT RETURNED TO CALLER
       * ---------------------------
       */

      const primaryImage = sortedImages[0];

      const imageUrl =
        primaryImage?.url_570xN ??
        primaryImage?.url_fullxfull ??
        primaryImage?.url_170x135 ??
        primaryImage?.url_75x75 ??
        null;

      storedResults.push({
        /*
         * True Etsy position.
         */
        position: listing.source_position,

        /*
         * USD/CAD position.
         */
        market_position: listing.market_position,

        listing_id: listing.listing_id,

        shop_id: listing.shop_id,

        title: listing.title,

        image_url: imageUrl,

        price,

        currency,

        favorites: listing.num_favorers ?? 0,

        views: listing.views ?? null,

        quantity: listing.quantity ?? null,

        state: listing.state,

        url: listing.url,

        original_creation_timestamp:
          listing.original_creation_timestamp ?? null,

        updated_timestamp: listing.updated_timestamp ?? null,

        tags: listing.tags ?? [],

        relevance_status: listing.relevance.status,

        relevance_reason: listing.relevance.reason,

        product_type: listing.relevance.productType,
      });
    }

    /*
     * ========================================================
     * 11. PRICE SUMMARIES
     * ========================================================
     */

    const sortedUsdPrices = [...usdPrices].sort((a, b) => a - b);

    const sortedCadPrices = [...cadPrices].sort((a, b) => a - b);

    /*
     * ========================================================
     * 12. KEYWORD SNAPSHOT
     * ========================================================
     */

    const keywordSnapshot = {
      research_run_id: researchRun.id,

      keyword_id: keywordRecord.id,

      source_id: source.id,

      total_result_count: totalEtsyResults,

      /*
       * USD
       */

      usd_listing_count: usdPrices.length,

      lowest_usd_price: sortedUsdPrices.length ? sortedUsdPrices[0] : null,

      median_usd_price: calculateMedian(sortedUsdPrices),

      average_usd_price: calculateAverage(sortedUsdPrices),

      highest_usd_price: sortedUsdPrices.length
        ? sortedUsdPrices[sortedUsdPrices.length - 1]
        : null,

      /*
       * CAD
       */

      cad_listing_count: cadPrices.length,

      lowest_cad_price: sortedCadPrices.length ? sortedCadPrices[0] : null,

      median_cad_price: calculateMedian(sortedCadPrices),

      average_cad_price: calculateAverage(sortedCadPrices),

      highest_cad_price: sortedCadPrices.length
        ? sortedCadPrices[sortedCadPrices.length - 1]
        : null,

      /*
       * Engagement
       */

      median_views: calculateMedian(viewValues),

      average_views: calculateAverage(viewValues),

      median_favorites: calculateMedian(favoriteValues),

      average_favorites: calculateAverage(favoriteValues),

      listings_under_30_days: listingsUnder30Days,

      listings_under_90_days: listingsUnder90Days,

      listings_under_180_days: listingsUnder180Days,
    };

    /*
     * ========================================================
     * 13. TAG SNAPSHOTS
     * ========================================================
     */

    const tagRows = Array.from(tagCounts.entries()).map(
      ([tag, occurrenceCount]) => ({
        research_run_id: researchRun.id,

        keyword_id: keywordRecord.id,

        source_id: source.id,

        tag,

        occurrence_count: occurrenceCount,

        occurrence_percentage:
          relevantListings.length > 0
            ? Number(
                ((occurrenceCount / relevantListings.length) * 100).toFixed(3),
              )
            : 0,
      }),
    );

    /*
     * ========================================================
     * 14. DATABASE WRITE HELPERS
     * ========================================================
     */

    async function saveImages() {
      const affectedListingIds = Array.from(
        new Set(runListingRows.map((row) => row.listing_id)),
      );

      /*
       * listing_images represents the current image state for a
       * permanent listing, so refresh those images rather than
       * accumulating duplicate copies every run.
       */

      if (affectedListingIds.length > 0) {
        const { error: deleteImageError } = await supabaseAdmin
          .from("listing_images")
          .delete()
          .in("listing_id", affectedListingIds);

        if (deleteImageError) {
          throw deleteImageError;
        }
      }

      for (const chunk of chunkArray(imageRows, BULK_CHUNK_SIZE)) {
        if (chunk.length === 0) {
          continue;
        }

        const { error: imageInsertError } = await supabaseAdmin
          .from("listing_images")
          .insert(chunk);

        if (imageInsertError) {
          throw imageInsertError;
        }
      }
    }

    async function saveRunListings() {
      if (runListingRows.length === 0) {
        return;
      }

      const { error } = await supabaseAdmin
        .from("research_run_listings")
        .insert(runListingRows);

      if (error) {
        throw error;
      }
    }

    async function saveSnapshots() {
      if (snapshotRows.length === 0) {
        return;
      }

      const { error } = await supabaseAdmin
        .from("listing_snapshots")
        .insert(snapshotRows);

      if (error) {
        throw error;
      }
    }

    async function saveKeywordSnapshot() {
      const { error } = await supabaseAdmin
        .from("keyword_snapshots")
        .insert(keywordSnapshot);

      if (error) {
        throw error;
      }
    }

    async function saveTagSnapshots() {
      for (const chunk of chunkArray(tagRows, BULK_CHUNK_SIZE)) {
        if (chunk.length === 0) {
          continue;
        }

        const { error } = await supabaseAdmin
          .from("tag_snapshots")
          .insert(chunk);

        if (error) {
          throw error;
        }
      }
    }

    /*
     * ========================================================
     * 15. TRACKING RECORD
     * ========================================================
     *
     * The shared collector reads tracking status but does NOT
     * alter the tracking schedule here.
     *
     * The scheduled-job layer will update:
     *
     * last_collected_at
     * next_collection_at
     *
     * only after a scheduled collection succeeds.
     */

    const trackingPromise = supabaseAdmin
      .from("tracked_keywords")
      .select(
        `
            id,
            is_active,
            tracking_frequency,
            last_collected_at,
            next_collection_at
          `,
      )
      .eq("keyword_id", keywordRecord.id)
      .eq("source_id", source.id)
      .maybeSingle();

    /*
     * ========================================================
     * 16. BULK WRITES
     * ========================================================
     */

    const [, , , , , trackingResult] = await Promise.all([
      saveImages(),

      saveRunListings(),

      saveSnapshots(),

      saveKeywordSnapshot(),

      saveTagSnapshots(),

      trackingPromise,
    ]);

    if (trackingResult.error) {
      throw trackingResult.error;
    }

    /*
     * ========================================================
     * 17. COMPLETE RESEARCH RUN
     * ========================================================
     */

    const completedAt = new Date().toISOString();

    const { error: completionError } = await supabaseAdmin
      .from("research_runs")
      .update({
        completed_at: completedAt,

        status: "completed",

        error_message: null,
      })
      .eq("id", researchRun.id);

    if (completionError) {
      throw completionError;
    }

    const trackedKeyword = trackingResult.data;

    /*
     * ========================================================
     * 18. RETURN PLAIN DATA
     * ========================================================
     *
     * There is deliberately no NextResponse here.
     *
     * The API route will decide how to turn this object into
     * an HTTP response.
     */

    return {
      success: true,

      keyword: normalizedKeyword,

      keyword_id: keywordRecord.id,

      source: {
        id: source.id,

        code: source.code,

        name: source.name,
      },

      market: {
        code: "US_CA",

        currencies: ["USD", "CAD"],

        target_results: TARGET_RESULTS,

        examined_results: examinedCount,

        pages_fetched: pagesFetched,
      },

      relevance: {
        search_intent: searchIntent,

        model: "deterministic_v1",

        collected: classifiedListings.length,

        relevant: relevantListings.length,

        uncertain: uncertainListings.length,

        excluded: excludedListings.length,
      },

      tracking: {
        is_tracked: trackedKeyword?.is_active ?? false,

        tracked_keyword_id: trackedKeyword?.id ?? null,

        frequency: trackedKeyword?.tracking_frequency ?? null,
      },

      research_run_id: researchRun.id,

      /*
       * Overall Etsy marketplace count.
       */
      total_results: totalEtsyResults,

      requested_results: TARGET_RESULTS,

      stored_results: storedResults.length,

      market_summary: keywordSnapshot,

      results: storedResults,
    };
  } catch (error) {
    /*
     * ========================================================
     * FAILED RUN RECORD
     * ========================================================
     */

    console.error(`TrendForge Etsy ${runType} collection error:`, error);

    if (activeResearchRunId !== null) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      const { error: failureUpdateError } = await supabaseAdmin
        .from("research_runs")
        .update({
          status: "failed",

          error_message: errorMessage,
        })
        .eq("id", activeResearchRunId);

      if (failureUpdateError) {
        console.error(
          "Unable to mark failed research run:",
          failureUpdateError,
        );
      }
    }

    /*
     * Preserve collector errors that already carry an HTTP
     * status/details payload.
     */

    if (error instanceof EtsyCollectorError) {
      throw error;
    }

    /*
     * Database or unexpected application errors become a
     * standard collector error.
     */

    throw new EtsyCollectorError(
      error instanceof Error
        ? error.message
        : "TrendForge was unable to complete the Etsy analysis.",
      500,
      error,
    );
  }
}
