"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Keyword = {
  id: number;
  keyword: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
};

type SearchStatus = "idle" | "loading" | "success" | "error";

export default function Home() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");

  const [searchMessage, setSearchMessage] = useState("");

  useEffect(() => {
    async function loadKeywords() {
      const { data, error } = await supabase
        .from("keywords")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Unable to load keywords:", error);
        setKeywords([]);
      } else {
        setKeywords(data ?? []);
      }

      setLoading(false);
    }

    loadKeywords();
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

    try {
      const response = await fetch(
        `/api/etsy/search?keyword=${encodeURIComponent(keyword)}`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to analyze keyword.");
      }

      setSearchStatus("success");
      setSearchMessage(data.message || "TrendForge analysis is ready.");
    } catch (error) {
      setSearchStatus("error");

      setSearchMessage(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
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

                if (searchStatus !== "idle") {
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
              Etsy marketplace analysis will become available when the
              TrendForge Etsy API application is approved.
            </p>
          )}

          {searchStatus === "loading" && (
            <p className="mt-3 text-sm text-zinc-400">
              Preparing TrendForge analysis...
            </p>
          )}

          {searchStatus === "success" && (
            <div className="mt-4 rounded-xl border border-green-900 bg-green-950/40 p-4">
              <p className="text-sm font-medium text-green-400">
                {searchMessage}
              </p>
            </div>
          )}

          {searchStatus === "error" && (
            <div className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-4">
              <p className="text-sm font-medium text-red-400">
                {searchMessage}
              </p>
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-500">
                TREND TRACKING
              </p>

              <h2 className="mt-1 text-xl font-semibold">Tracked Keywords</h2>
            </div>

            <span className="text-sm text-zinc-500">
              {keywords.length} {keywords.length === 1 ? "tracked" : "tracked"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {loading && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-zinc-500">Loading keywords...</p>
              </div>
            )}

            {!loading && keywords.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-zinc-500">No tracked keywords yet.</p>
              </div>
            )}

            {!loading &&
              keywords.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
                >
                  <div>
                    <p className="font-medium">{item.keyword}</p>

                    <p className="mt-1 text-sm text-zinc-500">
                      {item.category ?? "Uncategorized"}
                    </p>
                  </div>

                  <span
                    className={
                      item.is_active
                        ? "rounded-full bg-green-950 px-3 py-1 text-xs text-green-400"
                        : "rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400"
                    }
                  >
                    {item.is_active ? "Tracking" : "Paused"}
                  </span>
                </div>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}
