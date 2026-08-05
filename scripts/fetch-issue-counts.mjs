#!/usr/bin/env node
// Build issues.json: repo -> { open, closed } issue counts from GitHub.
//
// Unlike first_release.json this is NOT incremental -- issue counts change as
// issues are opened/closed, so every repo is re-queried on each run.
//
// Uses the GraphQL API for two reasons the REST API can't match:
//   1. REST's `open_issues_count` counts open PULL REQUESTS as issues (a known
//      gotcha); GraphQL's issues() connection is issues-only, PRs excluded.
//   2. GraphQL batches many repos per request via aliases, so ~220 plugins
//      cost ~8 calls instead of ~440.

import { readFileSync, writeFileSync } from "node:fs";

const SCRAPER = "https://raw.githubusercontent.com/syt2/zotero-addons-scraper/publish/addon_infos.json";
const OUT = new URL("../issues.json", import.meta.url);
const BATCH = 30; // repos per GraphQL request

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

// One GraphQL request covering a batch of repos, each aliased r0, r1, ....
// A repo that is gone/renamed comes back as null (with a NOT_FOUND in errors),
// which we simply skip.
async function fetchBatch(batch) {
  const body = batch.map((repo, i) => {
    const slash = repo.indexOf("/");
    const owner = repo.slice(0, slash);
    const name = repo.slice(slash + 1);
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {`
      + ` hasIssuesEnabled`
      + ` open: issues(states: OPEN) { totalCount }`
      + ` closed: issues(states: CLOSED) { totalCount } }`;
  }).join("\n");

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: `query {\n${body}\n}` }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  // Partial results still arrive in json.data even when some repos error.
  const out = {};
  const data = json.data || {};
  batch.forEach((repo, i) => {
    const node = data[`r${i}`];
    if (!node) return;
    // A repo with its Issues tab disabled reports 0/0, which would read as
    // "no issues" -- mark it so the page can show a dash instead.
    out[repo] = node.hasIssuesEnabled
      ? { open: node.open.totalCount, closed: node.closed.totalCount }
      : { disabled: true };
  });
  return out;
}

const addons = await (await fetch(SCRAPER)).json();
const repos = [...new Set(addons.map(p => p.repo).filter(Boolean))].sort();

const out = {};
let missing = 0;
for (let i = 0; i < repos.length; i += BATCH) {
  const batch = repos.slice(i, i + BATCH);
  try {
    Object.assign(out, await fetchBatch(batch));
  } catch (e) {
    console.error(`batch ${i}-${i + batch.length}: ${e.message}`);
  }
}
for (const repo of repos) if (!out[repo]) missing++;

// Preserve last-known counts for repos that errored this run, so a transient
// GraphQL hiccup doesn't blank a column that was fine yesterday.
let existing = {};
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
for (const repo of repos) if (!out[repo] && existing[repo]) out[repo] = existing[repo];

// Emit with keys in sorted order for a stable diff. (Note: an ARRAY as the
// JSON.stringify replacer is a key ALLOWLIST applied at every level -- it would
// strip the nested open/closed keys -- so sort by rebuilding, not via replacer.)
const sorted = {};
for (const repo of Object.keys(out).sort()) sorted[repo] = out[repo];
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`${Object.keys(sorted).length} repos written (${missing} not found this run)`);
