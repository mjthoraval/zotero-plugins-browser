#!/usr/bin/env node
// Build xpi_sizes.json: XPI download URL -> size in bytes, for the page's "Size"
// column. The scraper data doesn't carry sizes.
//
// GitHub-hosted XPIs are sized from the release API (GraphQL releaseAssets),
// NEVER by requesting the file: a GET of a release asset counts as a download on
// the plugin's release page, and hourly requests would inflate every author's
// numbers. Only non-GitHub files (a few Gitee raw URLs) get a HEAD request.
//
// Incremental: an asset under a fixed tag doesn't change size, so only URLs not
// yet in the file are queried -- plus "releases/latest/download/..." and
// non-GitHub URLs, which can point at a new file at any time. `--all` re-queries
// everything.

import { readFileSync, writeFileSync } from "node:fs";

const SCRAPER = "https://raw.githubusercontent.com/syt2/zotero-addons-scraper/publish/addon_infos.json";
const OUT = new URL("../xpi_sizes.json", import.meta.url);
const BATCH = 30;
const ALL = process.argv.includes("--all");

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error("A GITHUB_TOKEN is required for the GraphQL API.");
  process.exit(1);
}
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "User-Agent": "zotero-plugins-browser",
};

// github.com/<owner>/<repo>/releases/download/<tag>/<file>, where the tag may
// itself contain slashes ("zotero-plugin/v0.1.0"), or .../releases/latest/download/<file>.
const GH_ASSET = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/(?:latest\/download|download\/(.+))\/([^/?#]+)$/;

function parse(url) {
  const m = GH_ASSET.exec(url);
  if (!m) return null;
  const [, owner, name, tag, file] = m;
  return {
    owner,
    name,
    tag: tag === undefined ? null : decodeURIComponent(tag), // null = latest release
    file: decodeURIComponent(file),
  };
}

// One GraphQL request for a batch of releases: [{ owner, name, tag, urls: [{url, file}] }].
async function fetchBatch(batch) {
  const body = batch.map((rel, i) => {
    const release = rel.tag === null
      ? "latestRelease"
      : `release(tagName: ${JSON.stringify(rel.tag)})`;
    return `r${i}: repository(owner: ${JSON.stringify(rel.owner)}, name: ${JSON.stringify(rel.name)}) {`
      + ` ${release} { releaseAssets(first: 100) { nodes { name size } } } }`;
  }).join("\n");

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: `query {\n${body}\n}` }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  // A missing repo or tag comes back as a partial result plus `errors`; the
  // rest of the batch is still usable.
  const data = (await res.json()).data || {};
  const out = {};
  batch.forEach((rel, i) => {
    const r = data[`r${i}`];
    const nodes = (r && (r.release || r.latestRelease) || {}).releaseAssets?.nodes || [];
    for (const { url, file } of rel.urls) {
      const asset = nodes.find(n => n.name === file)
        || nodes.find(n => n.name.toLowerCase() === file.toLowerCase());
      if (asset) out[url] = asset.size;
    }
  });
  return out;
}

async function headSize(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": "zotero-plugins-browser" } });
    const len = Number(res.headers.get("content-length"));
    return res.ok && len > 0 ? len : null;
  } catch {
    return null;
  }
}

const addons = await (await fetch(SCRAPER)).json();
const urls = [...new Set(addons.flatMap(p => (p.releases || [])
  .map(r => r.xpiDownloadUrl?.github).filter(Boolean)))].sort();

let existing = {};
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}

const volatile = url => { const p = parse(url); return !p || p.tag === null; };
const todo = urls.filter(url => ALL || existing[url] === undefined || volatile(url));

// Group the GitHub URLs by release, so a release with several XPIs costs one alias.
const releases = new Map();
const others = [];
for (const url of todo) {
  const p = parse(url);
  if (!p) { others.push(url); continue; }
  const key = `${p.owner}/${p.name}@${p.tag ?? "<latest>"}`;
  if (!releases.has(key)) releases.set(key, { owner: p.owner, name: p.name, tag: p.tag, urls: [] });
  releases.get(key).urls.push({ url, file: p.file });
}

const found = {};
const list = [...releases.values()];
for (let i = 0; i < list.length; i += BATCH) {
  try {
    Object.assign(found, await fetchBatch(list.slice(i, i + BATCH)));
  } catch (e) {
    console.error(`batch ${i}: ${e.message}`);
  }
}
for (const url of others) {
  const size = await headSize(url);
  if (size) found[url] = size;
}

// Keep only URLs the registry still lists; keep the last-known size of one that
// errored this run, so a transient hiccup doesn't blank the cell.
const out = {};
const missing = [];
for (const url of urls) {
  const size = found[url] ?? existing[url];
  if (size === undefined) missing.push(url);
  else out[url] = size;
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(out).length} of ${urls.length} XPI sizes written; queried ${todo.length} (${list.length} releases, ${others.length} non-GitHub); ${missing.length} without a size`);
for (const url of missing.slice(0, 20)) console.log(`  no size: ${url}`);
