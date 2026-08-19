export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!siteUrl) {
    console.error("TrendForge worker: site URL is unavailable.");
    return;
  }

  if (!cronSecret) {
    console.error("TrendForge worker: CRON_SECRET is unavailable.");
    return;
  }

  const maxPasses = 10;

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    try {
      console.log(`TrendForge worker starting pass ${pass}.`);

      const response = await fetch(`${siteUrl}/api/cron/tracked-keywords`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });

      const body = await response.text();

      if (!response.ok) {
        console.error(
          `TrendForge worker pass ${pass} failed (${response.status}):`,
          body,
        );
        return;
      }

      console.log(`TrendForge worker pass ${pass} completed:`, body);

      let result;

      try {
        result = JSON.parse(body);
      } catch {
        console.error(`TrendForge worker pass ${pass} returned invalid JSON.`);
        return;
      }

      if (result.remaining_due_estimate === 0 || result.due_count === 0) {
        console.log("TrendForge worker finished. No more keywords are due.");
        return;
      }
    } catch (error) {
      console.error(`TrendForge worker pass ${pass} request failed:`, error);
      return;
    }
  }

  console.warn(
    `TrendForge worker stopped after ${maxPasses} passes. Additional due keywords may remain.`,
  );
};

export const config = {
  background: true,
};
