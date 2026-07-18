import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const blockedDirectories = new Set(["node_modules", "dist", "dist-vault", "coverage", "upload", ".git"]);
const textExtensions = new Set(["", ".cjs", ".css", ".dockerignore", ".example", ".html", ".js", ".json", ".md", ".mjs", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);

function fallbackFiles(directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && ![".dockerignore", ".env.example", ".github", ".gitignore"].includes(entry.name)) continue;
    if (entry.isDirectory()) {
      if (!blockedDirectories.has(entry.name)) files.push(...fallbackFiles(join(directory, entry.name)));
      continue;
    }
    const path = join(directory, entry.name);
    if (textExtensions.has(extname(entry.name)) || entry.name.startsWith(".")) files.push(relative(root, path));
  }
  return files;
}

function repositoryFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
  } catch {
    return fallbackFiles();
  }
}

const files = repositoryFiles();
const findings = [];
const prohibitedPaths = [
  /(^|\/)(secrets?|private|production|customer-data)\//i,
  /(^|\/)\.env(?!\.example$)/i,
  /\.(?:bak|backup|bundle|jks|key|keystore|p12|pem|pfx|sqlite|sqlite3|tar|tgz|zip)$/i,
  /\.tar\.gz$/i
];
const secretPatterns = [
  ["private-key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["OpenAI-style API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/]
];

for (const file of files) {
  if (prohibitedPaths.some((pattern) => pattern.test(file))) findings.push(`${file}: prohibited public-repository path`);
  const absolute = join(root, file);
  let stats;
  try { stats = statSync(absolute); } catch { continue; }
  if (stats.size > 5_000_000) findings.push(`${file}: file is larger than 5 MB`);
  if (file === "scripts/check-public-safety.mjs" || !textExtensions.has(extname(file)) && !file.startsWith(".")) continue;
  const content = readFileSync(absolute, "utf8");
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) findings.push(`${file}: possible ${label}`);
  }
}

if (findings.length) {
  console.error("Public repository safety check failed:\n" + findings.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Public repository safety check passed (${files.length} files inspected).`);
