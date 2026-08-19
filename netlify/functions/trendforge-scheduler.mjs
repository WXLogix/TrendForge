export default async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;

  if (!siteUrl) {
    console.error("TrendForge scheduler: site URL is unavailable.");
    return;
  }

  try {
    const response = await fetch(
      `${siteUrl}/.netlify/functions/trendforge-worker-background`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const body = await response.text();

      console.error(
        `TrendForge scheduler could not start background worker (${response.status}):`,
        body,
      );

      return;
    }

    console.log(`TrendForge background worker accepted (${response.status}).`);
  } catch (error) {
    console.error(
      "TrendForge scheduler could not start background worker:",
      error,
    );
  }
};

export const config = {
  schedule: "0 * * * *",
};
