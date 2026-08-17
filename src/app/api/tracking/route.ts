import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SOURCE_CODE = "etsy";

type TrackingRequest = {
  keyword_id?: number;
  action?: "track" | "untrack";
  frequency?: "daily" | "weekly" | "manual";
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TrackingRequest;

    const keywordId = body.keyword_id;
    const action = body.action;
    const frequency = body.frequency ?? "daily";

    if (!keywordId || !Number.isInteger(keywordId)) {
      return NextResponse.json(
        {
          error: "A valid keyword_id is required.",
        },
        { status: 400 },
      );
    }

    if (action !== "track" && action !== "untrack") {
      return NextResponse.json(
        {
          error: 'Action must be either "track" or "untrack".',
        },
        { status: 400 },
      );
    }

    /*
     * ---------------------------------------------------------
     * GET MARKET SOURCE
     * ---------------------------------------------------------
     */

    const { data: source, error: sourceError } = await supabaseAdmin
      .from("market_sources")
      .select("id, code, name")
      .eq("code", SOURCE_CODE)
      .single();

    if (sourceError || !source) {
      throw new Error("The Etsy market source could not be found.");
    }

    /*
     * ---------------------------------------------------------
     * VERIFY KEYWORD
     * ---------------------------------------------------------
     */

    const { data: keyword, error: keywordError } = await supabaseAdmin
      .from("keywords")
      .select("id, keyword")
      .eq("id", keywordId)
      .single();

    if (keywordError || !keyword) {
      return NextResponse.json(
        {
          error: "Keyword could not be found.",
        },
        { status: 404 },
      );
    }

    /*
     * ---------------------------------------------------------
     * TRACK
     * ---------------------------------------------------------
     */

    if (action === "track") {
      const now = new Date();

      let nextCollectionAt: string | null = null;

      if (frequency === "daily") {
        const next = new Date(now);
        next.setUTCDate(next.getUTCDate() + 1);

        nextCollectionAt = next.toISOString();
      }

      if (frequency === "weekly") {
        const next = new Date(now);
        next.setUTCDate(next.getUTCDate() + 7);

        nextCollectionAt = next.toISOString();
      }

      /*
       * Manual tracking intentionally has no automatic
       * next_collection_at value.
       */

      const { data: trackedKeyword, error: trackingError } = await supabaseAdmin
        .from("tracked_keywords")
        .upsert(
          {
            keyword_id: keyword.id,
            source_id: source.id,

            is_active: true,

            tracking_frequency: frequency,

            next_collection_at: nextCollectionAt,

            updated_at: now.toISOString(),
          },
          {
            onConflict: "keyword_id,source_id",
          },
        )
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
          updated_at
          `,
        )
        .single();

      if (trackingError) {
        throw trackingError;
      }

      return NextResponse.json({
        success: true,

        message: `"${keyword.keyword}" is now being tracked.`,

        tracking: {
          ...trackedKeyword,

          keyword: keyword.keyword,

          source: {
            id: source.id,
            code: source.code,
            name: source.name,
          },
        },
      });
    }

    /*
     * ---------------------------------------------------------
     * UNTRACK
     *
     * We do NOT delete the tracking record.
     *
     * Keeping it allows us to preserve historical tracking
     * configuration and reactivate it later.
     * ---------------------------------------------------------
     */

    const { data: existingTracking, error: existingTrackingError } =
      await supabaseAdmin
        .from("tracked_keywords")
        .select("id")
        .eq("keyword_id", keyword.id)
        .eq("source_id", source.id)
        .maybeSingle();

    if (existingTrackingError) {
      throw existingTrackingError;
    }

    if (!existingTracking) {
      return NextResponse.json({
        success: true,

        message: `"${keyword.keyword}" is not currently tracked.`,

        tracking: {
          is_active: false,
          keyword_id: keyword.id,
          keyword: keyword.keyword,
        },
      });
    }

    const { data: trackedKeyword, error: untrackError } = await supabaseAdmin
      .from("tracked_keywords")
      .update({
        is_active: false,
        next_collection_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingTracking.id)
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
        updated_at
        `,
      )
      .single();

    if (untrackError) {
      throw untrackError;
    }

    return NextResponse.json({
      success: true,

      message: `"${keyword.keyword}" is no longer being tracked.`,

      tracking: {
        ...trackedKeyword,

        keyword: keyword.keyword,

        source: {
          id: source.id,
          code: source.code,
          name: source.name,
        },
      },
    });
  } catch (error) {
    console.error("TrendForge tracking error:", error);

    return NextResponse.json(
      {
        error: "Unable to update keyword tracking.",

        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
