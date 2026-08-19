export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;

  const cronSecret = process.env.CRON_SECRET;

  if (!siteUrl) {
    console.error("TrendForge scheduler: site URL is unavailable.");

    return;
  }

  if (!cronSecret) {
    console.error("TrendForge scheduler: CRON_SECRET is unavailable.");

    return;
  }

  try {
    const response = await fetch(`${siteUrl}/api/cron/tracked-keywords`, {
      method: "GET",

      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const body = await response.text();

    if (!response.ok) {
      console.error(`TrendForge scheduler failed (${response.status}):`, body);

      return;
    }

    console.log("TrendForge scheduler completed:", body);
  } catch (error) {
    console.error("TrendForge scheduler request failed:", error);
  }
};

export const config = {
  schedule: "0 * * * *",
};
