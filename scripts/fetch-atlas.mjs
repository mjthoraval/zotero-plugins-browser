#!/usr/bin/env node
// Build atlas.json: repo -> the plugin's grade on zoteroplugins.org (Zotero
// Plugins Atlas), with the reason it gives and the slug of its page there.
// That data is by Ilias Beshimov, under CC BY 4.0: the page and the README
// credit it, as data/LICENSE in the Atlas repo asks.
//
// Matches on the GitHub repo, following renames and transfers, because the
// scraper keeps the name a plugin was added under. Never on the plugin ID: forks
// share it, and a grade belongs to the code of one repo (eschnett's
// zotero-citationcounts and talos-1's fork carry the same ID).
//
// Reads the Atlas's published catalogue and GitHub repo names, so no release
// asset is touched and no plugin's download count moves.

import { readFileSync, writeFileSync } from "node:fs";

const SCRAPER = "https://raw.githubusercontent.com/syt2/zotero-addons-scraper/publish/addon_infos.json";
const CATALOG = "https://raw.githubusercontent.com/iliasbeshimov/zoteroplugins.org/HEAD/data/generated/catalog.json";
const OUT = new URL("../atlas.json", import.meta.url);
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

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// "owner/name" in lower case from a GitHub URL; null for anything else.
function repoOf(url) {
  const m = /github\.com\/([^/]+\/[^/#?]+)/i.exec(url || "");
  return m ? m[1].replace(/\.git$/, "").toLowerCase() : null;
}

// One GraphQL request asking GitHub for the current name of a batch of repos,
// aliased r0, r1, .... A repo that is gone comes back as null and is left out.
async function currentNames(batch) {
  const body = batch.map((repo, i) => {
    const slash = repo.indexOf("/");
    const owner = repo.slice(0, slash);
    const name = repo.slice(slash + 1);
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { nameWithOwner }`;
  }).join("\n");

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: `query {\n${body}\n}` }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  // Partial results still arrive in json.data even when some repos error.
  const data = json.data || {};
  const out = new Map();
  batch.forEach((repo, i) => {
    const now = data[`r${i}`]?.nameWithOwner;
    if (now) out.set(repo, now.toLowerCase());
  });
  return out;
}

// A failed download stops the run here, before atlas.json is written, so the
// last good file stays published and the job shows red.
const [addons, { plugins }] = await Promise.all([getJson(SCRAPER), getJson(CATALOG)]);
if (!plugins?.length) throw new Error("The Atlas catalogue has no plugins.");

const byRepo = new Map();
for (const plugin of plugins) {
  const repo = repoOf(plugin.repo);
  if (repo) byRepo.set(repo, plugin);
}

const repos = [...new Set(addons.map(p => p.repo).filter(Boolean))].sort();
const entry = repo => byRepo.get(repo.toLowerCase());

const renamed = new Map();
const unmatched = repos.filter(repo => !entry(repo));
for (let i = 0; i < unmatched.length; i += BATCH) {
  const batch = unmatched.slice(i, i + BATCH);
  try {
    for (const [repo, now] of await currentNames(batch)) renamed.set(repo, now);
  } catch (e) {
    console.error(`batch ${i}-${i + batch.length}: ${e.message}`);
  }
}

// Preserve last-known grades for repos GitHub didn't answer for this run, so a
// transient hiccup doesn't blank them. A repo the Atlas dropped loses its grade.
let existing = {};
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
const sorted = {};
for (const repo of repos) {
  const plugin = entry(repo) || byRepo.get(renamed.get(repo));
  if (plugin) {
    sorted[repo] = { grade: plugin.grade, slug: plugin.slug };
    if (plugin.because) sorted[repo].why = plugin.because;
  }
  else if (!renamed.has(repo) && existing[repo]) {
    sorted[repo] = existing[repo];
  }
}
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`${Object.keys(sorted).length} of ${repos.length} repos are on the Atlas`);
const missing = repos.filter(repo => !sorted[repo]);
if (missing.length) console.log(`not on the Atlas: ${missing.join(", ")}`);
