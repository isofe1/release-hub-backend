# Release Hub Backend (Vercel Proxy)

Serverless proxy that fetches GitHub release data on the server side, so the
Android app never has to call `api.github.com` directly. This avoids
GitHub-access issues (e.g. needing a VPN) and GitHub API rate limits for
end users.

## Endpoints

### `GET /api/release?owner=<owner>&repo=<repo>`
Returns the latest release for a repository.

Example:
```
GET https://your-vercel-domain.vercel.app/api/release?owner=j-hc&repo=revanced-magisk-module
```

Response:
```json
{
  "tag_name": "v1.0.0",
  "name": "Release v1.0.0",
  "html_url": "https://github.com/owner/repo/releases/tag/v1.0.0",
  "published_at": "2026-01-01T00:00:00Z",
  "assets": [
    {
      "name": "app-release.apk",
      "download_url": "https://github.com/owner/repo/releases/download/v1.0.0/app-release.apk",
      "size": 15420000,
      "download_count": 1200,
      "content_type": "application/vnd.android.package-archive"
    }
  ]
}
```

### `GET /api/releases?owner=<owner>&repo=<repo>&per_page=10`
Returns a list of recent releases (not just the latest).

### `GET /api/search?q=<query>&page=1&per_page=20&sort=stars`
Searches GitHub repositories. `sort` accepts `stars`, `updated`, or omit for
best-match (GitHub's relevance ranking).

Note: GitHub's search API does not return release/tag info per repo, so the
search results do not include `latest_tag` or `has_releases` — fetch that
separately via `/api/release` once the user taps into a specific repo.

### `GET /api/health`
Quick check that the deployment is live and the token is configured.

## Deploy (خطوات النشر)

1. ارفع هذا المجلد إلى GitHub repo جديد (منفصل عن مشروع الأندرويد).
2. روح إلى https://vercel.com → New Project → اختر الـ repo.
3. من Project Settings → Environment Variables، ضيف:
   - `GITHUB_TOKEN` = التوكن تبعك (فقط صلاحية قراءة public repos)
4. اضغط Deploy.
5. بعد ما ينتهي، راح تحصل على رابط شبه:
   `https://release-hub-backend.vercel.app`
6. جرب: `https://release-hub-backend.vercel.app/api/health`
   لازم يرجع `{"status":"ok","githubTokenConfigured":true}`

## Notes
- Responses are cached at the edge for 5 minutes (`s-maxage=300`), so many
  users tracking the same repo will not each trigger a fresh GitHub API call.
- `owner`/`repo` are validated against `^[\w.-]+$` before being used in the
  GitHub API URL.
- On rate-limit or error responses, `Retry-After` / `X-RateLimit-*` headers
  (when present) are forwarded so the client can react appropriately.
