// The plugins every scheduled job covers: syt2/zotero-addons-scraper's list (fetched live), plus
// the plugins only the Zotero Plugins Atlas lists (atlas_only.json, written by fetch-atlas.mjs in
// the same shape). A job that runs before the first atlas_only.json simply covers the scraper's.

import { readFileSync } from "node:fs";

export const SCRAPER = "https://raw.githubusercontent.com/syt2/zotero-addons-scraper/publish/addon_infos.json";

export async function loadPlugins() {
  const addons = await (await fetch(SCRAPER)).json();
  let atlasOnly = [];
  try {
    atlasOnly = JSON.parse(readFileSync(new URL("../atlas_only.json", import.meta.url), "utf8"));
  } catch {}
  return addons.concat(Array.isArray(atlasOnly) ? atlasOnly : []);
}
