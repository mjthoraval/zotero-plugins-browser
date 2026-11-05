#!/usr/bin/env node
// Build authors.json: repo -> the author name a plugin declares in its own
// source files, the name Zotero's Plugins Manager shows. The scraper only has
// the GitHub profile's display name, which can be anything: "Marvin" for the
// author of Better BibTeX, Emiliano Heyns.
//
// Reads the default branch through the GraphQL API, so no release asset is
// touched and no plugin's download count moves. Not incremental: a name can
// change with any commit, so every repo is re-queried on each run.
//
// Keeps the name and nothing else. An author field can read
// "Name <address> (url)", and this file is published, so addresses stop here.

import { readFileSync, writeFileSync } from "node:fs";

const SCRAPER = "https://raw.githubusercontent.com/syt2/zotero-addons-scraper/publish/addon_infos.json";
const OUT = new URL("../authors.json", import.meta.url);
const BATCH = 30; // repos per GraphQL request

// In order of preference. A manifest wins when it holds a real name, as the
// Manager reads it; plugins built from a template keep a placeholder there and
// the name in package.json, which fills it in at build time.
const FILES = ["addon/manifest.json", "manifest.json", "src/manifest.json", "package.json"];
const PLACEHOLDER = /^$|__|\{\{|\$\{|<%|^(?:the )?author(?: name)?$|^your[ _-]?name/i;

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

// The name in an author field: a string, or package.json's { name, email, url }.
function nameOf(field) {
  const value = typeof field === "string" ? field : field?.name;
  if (typeof value !== "string") return "";
  const name = value
    .replace(/<[^>]*>/g, "")
    .replace(/\S+@\S+/g, "")
    .replace(/\(\s*(?:https?:|www\.)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return PLACEHOLDER.test(name) || /^https?:/i.test(name) ? "" : name;
}

function declaredName(text) {
  if (!text) return "";
  let json;
  try { json = JSON.parse(text.replace(/^﻿/, "")); } catch { return ""; }
  return nameOf(json?.author) || (Array.isArray(json?.authors) ? nameOf(json.authors[0]) : "");
}

// One GraphQL request covering a batch of repos, aliased r0, r1, ..., each file
// f0, f1, .... A missing file comes back as null; so does a repo that is gone,
// which is left out of the result.
async function fetchBatch(batch) {
  const body = batch.map((repo, i) => {
    const slash = repo.indexOf("/");
    const owner = repo.slice(0, slash);
    const name = repo.slice(slash + 1);
    const files = FILES.map((path, f) =>
      `f${f}: object(expression: ${JSON.stringify(`HEAD:${path}`)}) { ... on Blob { text } }`
    ).join(" ");
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${files} }`;
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
    out[repo] = "";
    for (let f = 0; f < FILES.length && !out[repo]; f++) {
      out[repo] = declaredName(node[`f${f}`]?.text);
    }
  });
  return out;
}

const addons = await (await fetch(SCRAPER)).json();
const repos = [...new Set(addons.map(p => p.repo).filter(Boolean))].sort();

const found = {};
for (let i = 0; i < repos.length; i += BATCH) {
  const batch = repos.slice(i, i + BATCH);
  try {
    Object.assign(found, await fetchBatch(batch));
  } catch (e) {
    console.error(`batch ${i}-${i + batch.length}: ${e.message}`);
  }
}

// Preserve last-known names for repos that errored this run, so a transient
// GraphQL hiccup doesn't blank them. A repo that answered with no name loses it.
let existing = {};
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
const sorted = {};
for (const repo of repos) {
  const name = repo in found ? found[repo] : existing[repo];
  if (name) sorted[repo] = name;
}
writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
console.log(`${Object.keys(sorted).length} of ${repos.length} repos have a name`);
const missing = repos.filter(repo => !(repo in found));
if (missing.length) console.log(`not found this run: ${missing.join(", ")}`);
