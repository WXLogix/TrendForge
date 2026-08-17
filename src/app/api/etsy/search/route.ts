import { NextRequest, NextResponse } from "next/server";

import { collectEtsyKeyword, EtsyCollectorError } from "@/lib/etsy-collector";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword")?.trim();

  if (!keyword) {
    return NextResponse.json(
      {
        error: "A keyword is required.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result = await collectEtsyKeyword({
      keyword,
      runType: "manual",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("TrendForge Etsy search route error:", error);

    if (error instanceof EtsyCollectorError) {
      return NextResponse.json(
        {
          error: error.message,

          details: error.details ?? null,
        },
        {
          status: error.status,
        },
      );
    }

    return NextResponse.json(
      {
        error: "TrendForge was unable to complete the Etsy analysis.",

        details: error instanceof Error ? error.message : "Unknown error",
      },
      {
        status: 500,
      },
    );
  }
}
