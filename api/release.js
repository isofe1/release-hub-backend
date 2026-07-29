// api/release.js (Vercel Serverless Function)
// GET /api/release?owner=<owner>&repo=<repo>

const NAME_PATTERN = /^[\w.-]+$/;

export default async function handler(req, res) {
  const { owner, repo } = req.query;

  if (!owner || !repo) {
    return res.status(400).json({ error: "Missing 'owner' or 'repo' parameter" });
  }

  // Basic validation so we never interpolate junk into the GitHub URL
  if (!NAME_PATTERN.test(owner) || !NAME_PATTERN.test(repo)) {
    return res.status(400).json({ error: "Invalid 'owner' or 'repo' parameter" });
  }

  // Enable CORS & Vercel Edge Cache (cache response for 5 mins to save GitHub rate limit)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const headers = {
    "User-Agent": "ReleaseHub-VercelProxy/1.0",
    "Accept": "application/vnd.github.v3+json",
  };

  if (githubToken) {
    headers["Authorization"] = `Bearer ${githubToken}`;
  }

  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    let response = await fetch(apiUrl, { headers });

    // Fallback to releases list if there is no "latest" tag defined
    if (response.status === 404) {
      const listUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;
      const listResponse = await fetch(listUrl, { headers });

      if (listResponse.ok) {
        const list = await listResponse.json();
        if (Array.isArray(list) && list.length > 0) {
          return res.status(200).json(formatRelease(list[0]));
        }
        return res.status(404).json({ error: "No releases found for this repository" });
      }

      response = listResponse;
    }

    if (!response.ok) {
      // Pass through GitHub's rate-limit info so the app/client can react sensibly
      const retryAfter = response.headers.get("retry-after");
      const rateRemaining = response.headers.get("x-ratelimit-remaining");
      const rateReset = response.headers.get("x-ratelimit-reset");

      if (retryAfter) res.setHeader("Retry-After", retryAfter);
      if (rateRemaining) res.setHeader("X-RateLimit-Remaining", rateRemaining);
      if (rateReset) res.setHeader("X-RateLimit-Reset", rateReset);

      return res.status(response.status).json({
        error: `GitHub API responded with ${response.status}`,
        status: response.status,
      });
    }

    const data = await response.json();
    return res.status(200).json(formatRelease(data));
  } catch (error) {
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}

function formatRelease(data) {
  return {
    tag_name: data.tag_name || "latest",
    name: data.name || data.tag_name || "Latest Release",
    html_url: data.html_url || "",
    published_at: data.published_at || null,
    assets: (data.assets || []).map((asset) => ({
      name: asset.name,
      download_url: asset.browser_download_url,
      size: asset.size || 0,
      download_count: asset.download_count || 0,
      content_type: asset.content_type || "application/octet-stream",
    })),
  };
}
