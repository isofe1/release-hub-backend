// api/releases.js (Vercel Serverless Function)
// GET /api/releases?owner=<owner>&repo=<repo>&per_page=10

const NAME_PATTERN = /^[\w.-]+$/;

export default async function handler(req, res) {
  const { owner, repo, per_page = "10" } = req.query;

  if (!owner || !repo) {
    return res.status(400).json({ error: "Missing 'owner' or 'repo' parameter", code: 400 });
  }
  if (!NAME_PATTERN.test(owner) || !NAME_PATTERN.test(repo)) {
    return res.status(400).json({ error: "Invalid 'owner' or 'repo' parameter", code: 400 });
  }

  const perPageNum = clampInt(per_page, 10, 1, 50);

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
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${perPageNum}`;
    const response = await fetch(apiUrl, { headers });

    if (response.status === 404) {
      return res.status(404).json({
        error: "المستودع غير موجود أو لا يحتوي على إصدارات رسمية",
        code: 404,
      });
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) res.setHeader("Retry-After", retryAfter);
      return res.status(response.status).json({
        error: `GitHub API responded with ${response.status}`,
        code: response.status,
      });
    }

    const list = await response.json();
    if (!Array.isArray(list)) {
      return res.status(502).json({ error: "Unexpected response from GitHub", code: 502 });
    }

    return res.status(200).json({
      owner,
      repo,
      releases: list.map((data) => formatRelease(data)),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Internal Server Error", code: 500 });
  }
}

function formatRelease(data) {
  return {
    tag_name: data.tag_name || "latest",
    name: data.name || data.tag_name || "Latest Release",
    published_at: data.published_at || null,
    html_url: data.html_url || "",
    body: data.body || "",
    assets: (data.assets || []).map((asset) => ({
      name: asset.name,
      download_url: asset.browser_download_url,
      size: asset.size || 0,
      download_count: asset.download_count || 0,
      content_type: asset.content_type || "application/octet-stream",
    })),
  };
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
