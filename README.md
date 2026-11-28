# Zotero Plugins Browser

A simple static webpage to browse the list of Zotero plugins from a browser, without installing Zotero or any plugin. It is a personal project, not affiliated with Zotero or the Zotero Plugins Atlas, and Zotero does not provide this data.

Live: **https://mjthoraval.github.io/zotero-plugins-browser/**

The plugin list comes from two sources. [`syt2/zotero-addons-scraper`](https://github.com/syt2/zotero-addons-scraper) is the same source used by the in-Zotero [Zotero Addons](https://github.com/syt2/zotero-addons) plugin; the page fetches its published JSON live on each load, from raw GitHub with jsDelivr as a fallback, so it stays in sync with the scraper. The [Zotero Plugins Atlas](https://zoteroplugins.org) lists many more plugins; a daily job adds the ones the scraper does not list (`atlas_only.json`, matched on the GitHub repo, following renames). Each plugin's name is followed by the icon of every list that includes it (the Atlas icon opens the plugin's Atlas page), with a "Listed in" filter. Scheduled jobs in this repo add what the scraper doesn't carry: release dates, download counts, issue counts, XPI sizes and authors from GitHub, and ratings from the [Zotero Plugins Atlas](https://zoteroplugins.org).

## What it shows

Mirrors the Zotero Addons list view (minus the local-install columns):

- Name and author, as `Name [username]`: the name the plugin declares in its `manifest.json` or `package.json` (from `authors.json`, refreshed by a scheduled job, without downloading any XPI) or else the GitHub display name, then the GitHub username when the two differ
- Description
- ★ stars
- Rating: the plugin's grade on the [Zotero Plugins Atlas](https://zoteroplugins.org), which links to its page there, with the site's reason in a tooltip (from `atlas.json`, refreshed by a scheduled job); a dash when the site doesn't list the plugin. Matched on the GitHub repo, following renames, and never on the plugin ID, because forks share it
- Release date and latest version (for the chosen Zotero target)
- Downloads of the latest version: the download count of the XPI of the plugin's newest release on GitHub, after the Latest version column (the version and its date in the tooltip) -- every install and every automatic update to that version (from `latest_downloads.json`, refreshed with the release dates by a scheduled job, from GitHub's release API without downloading anything); a dash when that release has no XPI or the job has not counted it yet
- Tags
- XPI size, for the release linked on that row (from `xpi_sizes.json`, refreshed by a scheduled job; a release newer than the last run is looked up by the page from GitHub's release API, without downloading it)
- Direct XPI download link

Plugins whose newest release declares a `strict_max_version` higher than Zotero allows are marked in red, with the declared maximum. Since Zotero 11's [feature freeze announcement of 2026-11-27](https://groups.google.com/g/zotero-dev/c/sKXoY_k2V3k) the limit is `11.0.*` ("you shouldn't set strict_max_version to a version higher than 11.0.*"; see [Updating plugin compatibility](https://www.zotero.org/support/dev/zotero_11_for_developers#updating_plugin_compatibility)): `11.*`, `11.*.*` and `11.1` are higher, as Mozilla's version comparison, which Zotero uses, ranks `*` above any number. The Zotero version selector stops at the allowed major. Both are set in `index.html` (`ALLOWED_MAX_VERSION`, `ALLOWED_ZOTERO_MAJOR`), to raise when Zotero announces the next feature freeze.

Plus: search, tag filters, sort by stars / rating / date / downloads / name / XPI size, Zotero version selector, and a light/dark theme that follows the OS.

## Run it yourself

It's a single self-contained HTML file with no build step. Either:

- Open https://mjthoraval.github.io/zotero-plugins-browser/, or
- Clone this repo and open `index.html` in any browser.

## Credits

- Plugin metadata: [`syt2/zotero-addons-scraper`](https://github.com/syt2/zotero-addons-scraper) (CC0, scraped from each plugin's GitHub).
- Ratings and their reasons, and the plugins only the Atlas lists: Zotero Plugins Atlas, [zoteroplugins.org](https://zoteroplugins.org) (Ilias Beshimov), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `atlas.json` keeps the grade, the reason and the page slug from its catalogue, unchanged; `atlas_only.json` keeps each Atlas-only plugin's name, summary, stars, jobs (as tags), version, release date and XPI link from it.
- In-Zotero counterpart: [`syt2/zotero-addons`](https://github.com/syt2/zotero-addons) (AGPL-3.0). The tag colours reuse its palette and hash (`src/utils/tagColor.ts`), so each tag has the same colour here as in the plugin.
- Site icon: `favicon.svg` (with `favicon.ico` and `apple-touch-icon.png` made from it) is drawn for this site: a puzzle piece on the page's accent colour.
- List icons: `icons/zotero-addons.svg` is the Zotero Addons plugin's icon ([`addon/content/icons/favicon.svg`](https://github.com/syt2/zotero-addons/blob/main/addon/content/icons/favicon.svg), AGPL-3.0); `icons/atlas.svg` is the Zotero Plugins Atlas icon ([zoteroplugins.org/favicon.svg](https://zoteroplugins.org/favicon.svg)).

This is an unofficial prototype, not maintained by syt2. If you'd like a similar feature integrated into the official project, see the discussion in the upstream issue tracker.
