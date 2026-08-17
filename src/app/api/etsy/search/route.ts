import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const keyword = searchParams.get("keyword");

  if (!keyword) {
    return NextResponse.json(
      { error: "A keyword is required." },
      { status: 400 },
    );
  }

  const apiKey = process.env.ETSY_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Etsy API is not configured.",
        status: "pending",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    success: true,
    keyword,
    message: "TrendForge Etsy API route is ready.",
  });
}
