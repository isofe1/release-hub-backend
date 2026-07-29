// api/search.js (Vercel Serverless Function)
// GET /api/search?q=<query>&page=1&per_page=20&sort=stars

const ALLOWED_SORTS = new Set(["stars", "updated", "best-match"]);

export default async function handler(req, res) {
  const { q, page = "1", per_page = "20", sort = "best-match" } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({ error: "Missing 'q' parameter", code: 400 });
  }

  const pageNum = clampInt(page, 1, 1, 100);
  const perPageNum = clampInt(per_page, 20, 1, 50);
  const sortValue = ALLOWED_SORTS.has(sort) ? sort : "best-match";

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
    const params = new URLSearchParams({
      q,
      page: String(pageNum),
      per_page: String(perPageNum),
    });
    // GitHub's search endpoint uses "sort" only for stars/updated; best-match is the default (omit sort)
    if (sortValue !== "best-match") {
      params.set("sort", sortValue);
      params.set("order", "desc");
    }

    const apiUrl = `https://api.github.com/search/repositories?${params.toString()}`;
    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) res.setHeader("Retry-After", retryAfter);
      return res.status(response.status).json({
        error: `GitHub API responded with ${response.status}`,
        code: response.status,
      });
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    // Fetch "latest tag" cheaply only where available in search payload is not provided by
    // GitHub search, so we mark has_releases based on repo metadata instead of an extra call
    // per item (keeps this endpoint fast and avoids extra rate-limit usage).
    return res.status(200).json({
      total_count: data.total_count || 0,
      page: pageNum,
      per_page: perPageNum,
      items: items.map(formatRepoItem),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Internal Server Error", code: 500 });
  }
}

function formatRepoItem(item) {
  return {
    owner: item.owner?.login || "",
    repo: item.name || "",
    full_name: item.full_name || "",
    description: item.description || "",
    stars: item.stargazers_count || 0,
    forks: item.forks_count || 0,
    language: item.language || null,
    avatar_url: item.owner?.avatar_url || "",
    html_url: item.html_url || "",
  };
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
