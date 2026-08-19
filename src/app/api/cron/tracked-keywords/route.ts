import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

import { collectEtsyKeyword, EtsyCollectorError } from "@/lib/etsy-collector";

type TrackingFrequency = "daily" | "weekly" | "manual";

type TrackedKeywordRow = {
  id: number;
  keyword_id: number;
  source_id: number;
  is_active: boolean;
  tracking_frequency: TrackingFrequency;
  last_collected_at: string | null;
  next_collection_at: string | null;

  keywords:
    | {
        id: number;
        keyword: string;
      }
    | {
        id: number;
        keyword: string;
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

type CollectionResult = {
  tracked_keyword_id: number;
  keyword_id: number;
  keyword: string;
  status: "collected" | "skipped" | "failed";
  reason?: string;
  research_run_id?: number;
  next_collection_at?: string | null;
  error?: string;
};

const MAX_KEYWORDS_PER_RUN = 2;

/*
 * ============================================================
 * CRON AUTH
 * ============================================================
 *
 * Add this to .env.local:
 *
 * CRON_SECRET=some-long-random-secret
 *
 * Later, when Netlify calls this endpoint, it should send:
 *
 * Authorization: Bearer <CRON_SECRET>
 *
 * For local testing, you can temporarily call the endpoint
 * manually with that same Authorization header.
 */

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  /*
   * Refuse to expose the scheduled collector if the secret
   * has not been configured.
   */

  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization");

  return authorization === `Bearer ${secret}`;
}

/*
 * ============================================================
 * RELATION HELPERS
 * ============================================================
 *
 * Supabase relation selects can sometimes be typed as either
 * an object or a one-element array depending on generated
 * types / relationship inference.
 */

function getKeywordRecord(value: TrackedKeywordRow["keywords"]) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function getSourceRecord(value: TrackedKeywordRow["market_sources"]) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

/*
 * ============================================================
 * SCHEDULE CALCULATION
 * ============================================================
 */

function calculateNextCollectionAt(
  frequency: TrackingFrequency,
  fromDate = new Date(),
) {
  const next = new Date(fromDate.getTime());

  if (frequency === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);

    return next.toISOString();
  }

  if (frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);

    return next.toISOString();
  }

  /*
   * Manual keywords should not be automatically scheduled.
   */
  return null;
}

/*
 * ============================================================
 * DUE CHECK
 * ============================================================
 */

function isDue(tracked: TrackedKeywordRow, now: Date) {
  if (!tracked.is_active) {
    return false;
  }

  if (tracked.tracking_frequency === "manual") {
    return false;
  }

  /*
   * If no next_collection_at exists yet, treat the keyword as
   * due so its first scheduled run can establish the schedule.
   */

  if (!tracked.next_collection_at) {
    return true;
  }

  const nextTime = new Date(tracked.next_collection_at).getTime();

  if (!Number.isFinite(nextTime)) {
    /*
     * A bad timestamp should not permanently block collection.
     */
    return true;
  }

  return nextTime <= now.getTime();
}

/*
 * ============================================================
 * SINGLE TRACKED KEYWORD
 * ============================================================
 */

async function collectTrackedKeyword(
  tracked: TrackedKeywordRow,
): Promise<CollectionResult> {
  const keywordRecord = getKeywordRecord(tracked.keywords);

  const sourceRecord = getSourceRecord(tracked.market_sources);

  if (!keywordRecord) {
    return {
      tracked_keyword_id: tracked.id,

      keyword_id: tracked.keyword_id,

      keyword: "Unknown",

      status: "failed",

      error: "Tracked keyword is missing its keyword record.",
    };
  }

  /*
   * The shared collector currently supports Etsy.
   *
   * This check protects the scheduler architecture when other
   * market sources are added later.
   */

  if (!sourceRecord || sourceRecord.code !== "etsy") {
    return {
      tracked_keyword_id: tracked.id,

      keyword_id: tracked.keyword_id,

      keyword: keywordRecord.keyword,

      status: "skipped",

      reason:
        "Scheduled collection is not implemented for this market source yet.",
    };
  }

  try {
    const result = await collectEtsyKeyword({
      keyword: keywordRecord.keyword,

      runType: "scheduled",
    });

    const collectedAt = new Date();

    const nextCollectionAt = calculateNextCollectionAt(
      tracked.tracking_frequency,
      collectedAt,
    );

    /*
     * Only advance the tracking schedule AFTER a successful
     * research run.
     */

    const { error: trackingUpdateError } = await supabaseAdmin
      .from("tracked_keywords")
      .update({
        last_collected_at: collectedAt.toISOString(),

        next_collection_at: nextCollectionAt,

        updated_at: collectedAt.toISOString(),
      })
      .eq("id", tracked.id);

    if (trackingUpdateError) {
      throw trackingUpdateError;
    }

    return {
      tracked_keyword_id: tracked.id,

      keyword_id: tracked.keyword_id,

      keyword: keywordRecord.keyword,

      status: "collected",

      research_run_id: result.research_run_id,

      next_collection_at: nextCollectionAt,
    };
  } catch (error) {
    return {
      tracked_keyword_id: tracked.id,

      keyword_id: tracked.keyword_id,

      keyword: keywordRecord.keyword,

      status: "failed",

      error:
        error instanceof EtsyCollectorError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown scheduled collection error.",
    };
  }
}

/*
 * ============================================================
 * GET
 * ============================================================
 *
 * GET is convenient for schedulers such as Netlify and for
 * local testing.
 */

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }

  const now = new Date();

  try {
    /*
     * ========================================================
     * 1. LOAD ACTIVE TRACKED KEYWORDS
     * ========================================================
     *
     * We intentionally load active non-manual tracking rows
     * and perform the due check in application code.
     *
     * That allows rows with null next_collection_at to receive
     * their first scheduled collection.
     */

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

            keywords (
              id,
              keyword
            ),

            market_sources (
              id,
              code,
              name
            )
          `,
      )
      .eq("is_active", true)
      .neq("tracking_frequency", "manual")
      .order("next_collection_at", {
        ascending: true,
        nullsFirst: true,
      });

    if (error) {
      throw error;
    }

    const trackedKeywords = (data ?? []) as unknown as TrackedKeywordRow[];

    /*
     * ========================================================
     * 2. FIND DUE ROWS
     * ========================================================
     */

    const dueKeywords = trackedKeywords
      .filter((tracked) => isDue(tracked, now))
      .slice(0, MAX_KEYWORDS_PER_RUN);

    if (dueKeywords.length === 0) {
      return NextResponse.json({
        success: true,

        checked_at: now.toISOString(),

        due_count: 0,

        collected_count: 0,

        failed_count: 0,

        skipped_count: 0,

        message: "No tracked keywords are due for collection.",

        results: [],
      });
    }

    /*
     * ========================================================
     * 3. COLLECT SEQUENTIALLY
     * ========================================================
     *
     * Do NOT run every Etsy collection in parallel.
     *
     * Each collection can make multiple Etsy requests and
     * several database writes. Sequential execution is much
     * gentler on Etsy, Supabase, and serverless execution.
     */

    const results: CollectionResult[] = [];

    for (const tracked of dueKeywords) {
      const result = await collectTrackedKeyword(tracked);

      results.push(result);
    }

    /*
     * ========================================================
     * 4. SUMMARY
     * ========================================================
     */

    const collectedCount = results.filter(
      (result) => result.status === "collected",
    ).length;

    const failedCount = results.filter(
      (result) => result.status === "failed",
    ).length;

    const skippedCount = results.filter(
      (result) => result.status === "skipped",
    ).length;

    return NextResponse.json({
      success: failedCount === 0,

      checked_at: now.toISOString(),

      due_count: dueKeywords.length,

      collected_count: collectedCount,

      failed_count: failedCount,

      skipped_count: skippedCount,

      /*
       * If more than the per-run limit were due, a future cron
       * invocation can process the remainder.
       */

      remaining_due_estimate: Math.max(
        0,
        trackedKeywords.filter((tracked) => isDue(tracked, now)).length -
          dueKeywords.length,
      ),

      results,
    });
  } catch (error) {
    console.error("TrendForge tracked-keyword cron error:", error);

    return NextResponse.json(
      {
        success: false,

        error: "TrendForge was unable to process tracked keywords.",

        details: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 500,
      },
    );
  }
}
