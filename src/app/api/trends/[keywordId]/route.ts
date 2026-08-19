import { NextRequest, NextResponse } from "next/server";
import { analyzeKeywordTrends } from "@/lib/trend-analysis";

type RouteContext = {
  params: Promise<{
    keywordId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { keywordId } = await context.params;
  const keywordIdNumber = Number(keywordId);

  if (!Number.isInteger(keywordIdNumber) || keywordIdNumber <= 0) {
    return NextResponse.json(
      {
        error: "A valid keyword ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await analyzeKeywordTrends(keywordIdNumber);

  if ("error" in result) {
    const status =
      result.error === "Keyword could not be found."
        ? 404
        : result.error === "A valid keyword ID is required."
          ? 400
          : 500;

    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
