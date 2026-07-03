#!/usr/bin/env node
// Build first_release.json: repo -> ISO date of the plugin's oldest surviving
// GitHub release (fallback: the repo's creation date, for repos that deleted
// their early releases). Incremental: repos already present in the file are
// kept as-is — a first-release date doesn't change — so the daily run only
// queries repos newly added to the registry.

import { readFileSync, writeFileSync } from "node:fs";

const SCRAPER = "https://raw.githubusercontent.com/syt2/zotero-addons-scraper/publish/addon_infos.json";
const OUT = new URL("../first_release.json", import.meta.url);

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const headers = { Accept: "application/vnd.github+json", "User-Agent": "zotero-plugins-browser" };
if (token) headers.Authorization = `Bearer ${token}`;

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res;
}

async function oldestReleaseDate(repo) {
  // Walk all release pages and keep the earliest date seen.
  let min = null;
  for (let page = 1; page <= 30; page++) {
    const res = await gh(`/repos/${repo}/releases?per_page=100&page=${page}`);
    if (!res) return null; // repo gone
    const list = await res.json();
    for (const r of list) {
      const d = r.published_at || r.created_at;
      if (d && (!min || d < min)) min = d;
    }
    if (list.length < 100) break;
  }
  if (min) return min;
  const res = await gh(`/repos/${repo}`);
  return res ? (await res.json()).created_at ?? null : null;
}

const addons = await (await fetch(SCRAPER)).json();
const repos = [...new Set(addons.map(p => p.repo).filter(Boolean))].sort();

let existing = {};
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}

const out = {};
let fetched = 0;
for (const repo of repos) {
  if (existing[repo]) { out[repo] = existing[repo]; continue; }
  try {
    const d = await oldestReleaseDate(repo);
    if (d) { out[repo] = d; fetched++; }
    else console.error(`no date found for ${repo}`);
  } catch (e) {
    console.error(`${repo}: ${e.message}`);
  }
}

writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(out).length} repos written (${fetched} newly fetched)`);
