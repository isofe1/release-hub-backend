export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({
    status: "ok",
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    time: new Date().toISOString(),
  });
}
