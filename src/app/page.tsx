"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Keyword = {
  id: number;
  keyword: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
};

export default function Home() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadKeywords() {
      const { data, error } = await supabase
        .from("keywords")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setKeywords(data ?? []);
      }

      setLoading(false);
    }

    loadKeywords();
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 p-10 text-white">
      <div className="mx-auto max-w-5xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-orange-400">
          Market Intelligence
        </p>

        <h1 className="text-4xl font-bold">TrendForge</h1>

        <p className="mt-3 text-zinc-400">
          Discover trends, research keywords, and find your next design
          opportunity.
        </p>

        <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold">Tracked Keywords</h2>

          {loading && <p className="mt-4 text-zinc-400">Loading keywords...</p>}

          {error && (
            <p className="mt-4 text-red-400">Supabase error: {error}</p>
          )}

          {!loading && !error && keywords.length === 0 && (
            <p className="mt-4 text-zinc-400">No keywords found.</p>
          )}

          <div className="mt-5 space-y-3">
            {keywords.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-4"
              >
                <div>
                  <p className="font-medium">{item.keyword}</p>
                  <p className="text-sm text-zinc-500">
                    {item.category ?? "Uncategorized"}
                  </p>
                </div>

                <span className="rounded-full bg-green-950 px-3 py-1 text-xs text-green-400">
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
