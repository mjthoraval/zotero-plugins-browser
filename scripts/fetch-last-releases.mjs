#!/usr/bin/env node
// Build last_release.json: repo -> ISO date of the plugin's NEWEST GitHub
// release. This makes the page's "Last updated" column independent of the
// upstream scraper's cadence (syt2/zotero-addons-scraper runs 6x/day, so a
// release published just after a run can look stale for hours).
//
// And latest_downloads.json: repo -> { tag, date, downloads } for the latest
// VERSION -- the newest release carrying an XPI (usually the same release, or
// published with it) -- `downloads` being the download count of its XPI
// file(s) on GitHub: every install and every automatic update to that
// version; null when none of the recent releases carries an XPI. Read from the
// release API's asset metadata, never by requesting a file, which would count
// as a download.
//
// NOT incremental -- the newest release and its count change over time, so
// every repo is re-queried each run. GraphQL batches ~30 repos/request (a
// handful of calls).

import { readFileSync, writeFileSync } from "node:fs";

const SCRAPER = "https://raw.githubusercontent.com/syt2/zotero-addons-scraper/publish/addon_infos.json";
const OUT = new URL("../last_release.json", import.meta.url);
const OUT_DL = new URL("../latest_downloads.json", import.meta.url);
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

// Newest release across a batch of repos. Fetch the 5 most recently created
// releases per repo and take the one with the latest publish date among
// non-drafts (prereleases DO count as updates; drafts are not public, so they
// don't), with its tag and the download counts of its .xpi assets.
async function fetchBatch(batch) {
  const body = batch.map((repo, i) => {
    const slash = repo.indexOf("/");
    const owner = repo.slice(0, slash);
    const name = repo.slice(slash + 1);
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {`
      + ` releases(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) {`
      + ` nodes { publishedAt createdAt isDraft tagName`
      + ` releaseAssets(first: 50) { nodes { name downloadCount } } } } }`;
  }).join("\n");

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: `query {\n${body}\n}` }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  const dates = {};
  const downloads = {};
  const data = json.data || {};
  batch.forEach((repo, i) => {
    const node = data[`r${i}`];
    if (!node) return;
    // The newest release dates "Last updated"; the newest one WITH an XPI is
    // the latest version, whose downloads are counted. They differ when the
    // newest is a rolling tag that only carries the update manifest
    // (`release`, the plugin template's update.json), published with the
    // version itself.
    let max = null, newestXpi = null, xpiDate = null, newestTag = null;
    for (const rel of node.releases.nodes) {
      if (rel.isDraft) continue;
      const d = rel.publishedAt || rel.createdAt;
      if (!d) continue;
      if (!max || d > max) { max = d; newestTag = rel.tagName; }
      const xpis = (rel.releaseAssets?.nodes || []).filter(a => /\.xpi$/i.test(a.name));
      if (xpis.length && (!xpiDate || d > xpiDate)) { xpiDate = d; newestXpi = { rel, xpis }; }
    }
    if (!max) return;
    dates[repo] = max;
    downloads[repo] = newestXpi
      ? { tag: newestXpi.rel.tagName, date: xpiDate, downloads: newestXpi.xpis.reduce((n, a) => n + (a.downloadCount || 0), 0) }
      : { tag: newestTag, date: max, downloads: null };
  });
  return { dates, downloads };
}

const addons = await (await fetch(SCRAPER)).json();
const repos = [...new Set(addons.map(p => p.repo).filter(Boolean))].sort();

const out = {};
const outDl = {};
let missing = 0;
for (let i = 0; i < repos.length; i += BATCH) {
  try {
    const { dates, downloads } = await fetchBatch(repos.slice(i, i + BATCH));
    Object.assign(out, dates);
    Object.assign(outDl, downloads);
  } catch (e) {
    console.error(`batch ${i}: ${e.message}`);
  }
}

// Preserve last-known values for repos that errored or have no releases this
// run, so a transient hiccup doesn't regress the columns.
let existing = {};
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
let existingDl = {};
try { existingDl = JSON.parse(readFileSync(OUT_DL, "utf8")); } catch {}
for (const repo of repos) {
  if (!out[repo] && existing[repo]) out[repo] = existing[repo];
  if (!outDl[repo] && existingDl[repo]) outDl[repo] = existingDl[repo];
  if (!out[repo]) missing++;
}

const sorted = {};
for (const repo of Object.keys(out).sort()) sorted[repo] = out[repo];
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
// One repo per line: the counts change on every run, and a line diff per
// changed repo keeps the bot's commits readable.
const dlRepos = Object.keys(outDl).sort();
writeFileSync(OUT_DL, "{\n" + dlRepos.map(r => `${JSON.stringify(r)}: ${JSON.stringify(outDl[r])}`).join(",\n") + "\n}\n");
const noXpi = dlRepos.filter(r => outDl[r].downloads == null).length;
console.log(`${Object.keys(sorted).length} repos written (${missing} without a release date); `
  + `${dlRepos.length} download counts (${noXpi} latest releases without an XPI)`);
