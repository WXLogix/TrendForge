import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { runId } = await context.params;

    const researchRunId = Number(runId);

    if (!Number.isInteger(researchRunId) || researchRunId <= 0) {
      return NextResponse.json(
        {
          error: "A valid research run ID is required.",
        },
        { status: 400 },
      );
    }

    /*
     * ========================================================
     * 1. LOAD RESEARCH RUN
     * ========================================================
     */

    const { data: researchRun, error: researchRunError } = await supabaseAdmin
      .from("research_runs")
      .select(
        `
        id,
        run_type,
        total_result_count,
        requested_limit,
        returned_count,
        started_at,
        completed_at,
        metadata,
        keyword:keywords (
          id,
          keyword,
          category
        ),
        source:market_sources (
          id,
          code,
          name
        )
      `,
      )
      .eq("id", researchRunId)
      .single();

    if (researchRunError || !researchRun) {
      return NextResponse.json(
        {
          error: "Research run could not be found.",
        },
        { status: 404 },
      );
    }

    /*
     * ========================================================
     * 2. LOAD MARKET SUMMARY
     * ========================================================
     */

    const { data: marketSummary, error: marketSummaryError } =
      await supabaseAdmin
        .from("keyword_snapshots")
        .select(
          `
        total_result_count,
        usd_listing_count,
        lowest_usd_price,
        median_usd_price,
        average_usd_price,
        highest_usd_price,
        median_views,
        average_views,
        median_favorites,
        average_favorites,
        listings_under_30_days,
        listings_under_90_days,
        listings_under_180_days,
        snapshot_at
      `,
        )
        .eq("research_run_id", researchRunId)
        .maybeSingle();

    if (marketSummaryError) {
      throw marketSummaryError;
    }

    /*
     * ========================================================
     * 3. LOAD THE EXACT LISTINGS FROM THIS RESEARCH RUN
     *
     * research_run_listings preserves Etsy search position.
     * listing_snapshots preserves the metrics as they existed
     * when this particular analysis was performed.
     * ========================================================
     */

    const { data: runListings, error: runListingsError } = await supabaseAdmin
      .from("research_run_listings")
      .select(
        `
        listing_id,
        search_position,
        listing:listings (
          id,
          external_listing_id,
          external_shop_id,
          title,
          url,
          currency_code,
          original_creation_timestamp,
          tags,
          first_seen_at,
          last_seen_at
        )
      `,
      )
      .eq("research_run_id", researchRunId)
      .order("search_position", {
        ascending: true,
      });

    if (runListingsError) {
      throw runListingsError;
    }

    /*
     * ========================================================
     * 4. LOAD HISTORICAL SNAPSHOTS FOR THIS RUN
     * ========================================================
     */

    const { data: snapshots, error: snapshotsError } = await supabaseAdmin
      .from("listing_snapshots")
      .select(
        `
        listing_id,
        search_position,
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
      .eq("research_run_id", researchRunId);

    if (snapshotsError) {
      throw snapshotsError;
    }

    /*
     * ========================================================
     * 5. LOAD IMAGES
     * ========================================================
     */

    const listingIds = runListings?.map((item) => item.listing_id) ?? [];

    let images: {
      listing_id: number;
      image_rank: number;
      url_75: string | null;
      url_170: string | null;
      url_570: string | null;
      url_full: string | null;
      alt_text: string | null;
    }[] = [];

    if (listingIds.length > 0) {
      const { data: imageData, error: imageError } = await supabaseAdmin
        .from("listing_images")
        .select(
          `
          listing_id,
          image_rank,
          url_75,
          url_170,
          url_570,
          url_full,
          alt_text
        `,
        )
        .in("listing_id", listingIds)
        .order("image_rank", {
          ascending: true,
        });

      if (imageError) {
        throw imageError;
      }

      images = imageData ?? [];
    }

    /*
     * ========================================================
     * 6. LOAD TAG SNAPSHOTS
     * ========================================================
     */

    const { data: tags, error: tagsError } = await supabaseAdmin
      .from("tag_snapshots")
      .select(
        `
        tag,
        occurrence_count,
        occurrence_percentage
      `,
      )
      .eq("research_run_id", researchRunId)
      .order("occurrence_count", {
        ascending: false,
      });

    if (tagsError) {
      throw tagsError;
    }

    /*
     * ========================================================
     * 7. BUILD LOOKUP MAPS
     * ========================================================
     */

    const snapshotMap = new Map(
      (snapshots ?? []).map((snapshot) => [snapshot.listing_id, snapshot]),
    );

    const imagesByListing = new Map<number, typeof images>();

    for (const image of images) {
      const existing = imagesByListing.get(image.listing_id) ?? [];

      existing.push(image);

      imagesByListing.set(image.listing_id, existing);
    }

    /*
     * ========================================================
     * 8. BUILD RESULTS
     * ========================================================
     */

    const results = (runListings ?? []).map((runListing) => {
      const listing = Array.isArray(runListing.listing)
        ? runListing.listing[0]
        : runListing.listing;

      const snapshot = snapshotMap.get(runListing.listing_id);

      const listingImages = imagesByListing.get(runListing.listing_id) ?? [];

      const primaryImage = listingImages[0];

      const primaryImageUrl =
        primaryImage?.url_570 ??
        primaryImage?.url_full ??
        primaryImage?.url_170 ??
        primaryImage?.url_75 ??
        null;

      return {
        position: runListing.search_position,

        internal_listing_id: runListing.listing_id,

        listing_id: listing?.external_listing_id ?? null,

        shop_id: listing?.external_shop_id ?? null,

        title: listing?.title ?? "",

        url: listing?.url ?? null,

        image_url: primaryImageUrl,

        images: listingImages,

        price: snapshot?.price ?? null,

        currency: snapshot?.currency_code ?? listing?.currency_code ?? null,

        views: snapshot?.views ?? null,

        favorites: snapshot?.favorites ?? null,

        quantity: snapshot?.quantity ?? null,

        state: snapshot?.state ?? null,

        original_creation_timestamp:
          snapshot?.original_creation_timestamp ??
          listing?.original_creation_timestamp ??
          null,

        updated_timestamp: snapshot?.updated_timestamp ?? null,

        observed_at: snapshot?.observed_at ?? null,

        tags: listing?.tags ?? [],
      };
    });

    /*
     * ========================================================
     * 9. RESPONSE
     * ========================================================
     */

    return NextResponse.json({
      success: true,

      research_run: researchRun,

      market_summary: marketSummary ?? null,

      trending_tags: tags ?? [],

      result_count: results.length,

      results,
    });
  } catch (error) {
    console.error("TrendForge research retrieval error:", error);

    return NextResponse.json(
      {
        error: "TrendForge was unable to load this research run.",

        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
