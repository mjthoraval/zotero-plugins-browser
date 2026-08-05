#!/usr/bin/env node
// Build last_release.json: repo -> ISO date of the plugin's NEWEST GitHub
// release. This makes the page's "Last updated" column independent of the
// upstream scraper's cadence (syt2/zotero-addons-scraper runs 6x/day, so a
// release published just after a run can look stale for hours).
//
// NOT incremental -- the newest release changes over time, so every repo is
// re-queried each run. GraphQL batches ~30 repos/request (a handful of calls).

import { readFileSync, writeFileSync } from "node:fs";

const SCRAPER = "https://raw.githubusercontent.com/syt2/zotero-addons-scraper/publish/addon_infos.json";
const OUT = new URL("../last_release.json", import.meta.url);
const BATCH = 30;

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

// Newest release date across a batch of repos. Fetch the 5 most recently
// created releases per repo and take the max publish date among non-drafts
// (prereleases DO count as updates; drafts are not public, so they don't).
async function fetchBatch(batch) {
  const body = batch.map((repo, i) => {
    const slash = repo.indexOf("/");
    const owner = repo.slice(0, slash);
    const name = repo.slice(slash + 1);
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {`
      + ` releases(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) {`
      + ` nodes { publishedAt createdAt isDraft } } }`;
  }).join("\n");

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: `query {\n${body}\n}` }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  const out = {};
  const data = json.data || {};
  batch.forEach((repo, i) => {
    const node = data[`r${i}`];
    if (!node) return;
    let max = null;
    for (const rel of node.releases.nodes) {
      if (rel.isDraft) continue;
      const d = rel.publishedAt || rel.createdAt;
      if (d && (!max || d > max)) max = d;
    }
    if (max) out[repo] = max;
  });
  return out;
}

const addons = await (await fetch(SCRAPER)).json();
const repos = [...new Set(addons.map(p => p.repo).filter(Boolean))].sort();

const out = {};
let missing = 0;
for (let i = 0; i < repos.length; i += BATCH) {
  try {
    Object.assign(out, await fetchBatch(repos.slice(i, i + BATCH)));
  } catch (e) {
    console.error(`batch ${i}: ${e.message}`);
  }
}

// Preserve last-known dates for repos that errored or have no releases this
// run, so a transient hiccup doesn't regress the column.
let existing = {};
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
for (const repo of repos) {
  if (!out[repo] && existing[repo]) out[repo] = existing[repo];
  if (!out[repo]) missing++;
}

const sorted = {};
for (const repo of Object.keys(out).sort()) sorted[repo] = out[repo];
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`${Object.keys(sorted).length} repos written (${missing} without a release date)`);
