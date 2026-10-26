# Zotero Plugins Browser

A simple static webpage to browse the list of Zotero plugins from a browser, without installing Zotero or any plugin.

Live: **https://mjthoraval.github.io/zotero-plugins-browser/**

The plugin data comes from [`syt2/zotero-addons-scraper`](https://github.com/syt2/zotero-addons-scraper), the same source used by the in-Zotero [Zotero Addons](https://github.com/syt2/zotero-addons) plugin. The page is a thin consumer: it fetches the published JSON live from jsDelivr on each load, so it stays in sync with the scraper.

## What it shows

Mirrors the Zotero Addons list view (minus the local-install columns):

- Name and author
- Description
- ★ stars
- Release date and latest version (for the chosen Zotero target)
- Tags
- XPI size, for the release linked on that row (from `xpi_sizes.json`, refreshed by a scheduled job; a release newer than the last run is looked up by the page from GitHub's release API, without downloading it)
- Direct XPI download link

Plugins whose newest release declares compatibility with a Zotero major that Zotero asks plugins not to declare yet (currently Zotero 11+: ["Do not update your plugin to declare compatibility with Zotero 11 at this time"](https://www.zotero.org/support/dev/zotero_11_for_developers#updating_plugin_compatibility)) are marked in red, with the declared maximum; the Zotero version selector stops at the allowed major (`ALLOWED_ZOTERO_MAJOR` in `index.html`, to raise when Zotero announces the next feature freeze).

Plus: search, tag filters, sort by stars / date / name / XPI size, Zotero version selector, and a light/dark theme that follows the OS.

## Run it yourself

It's a single self-contained HTML file with no build step. Either:

- Open https://mjthoraval.github.io/zotero-plugins-browser/, or
- Clone this repo and open `index.html` in any browser.

## Credits

- Plugin metadata: [`syt2/zotero-addons-scraper`](https://github.com/syt2/zotero-addons-scraper) (CC0, scraped from each plugin's GitHub).
- In-Zotero counterpart: [`syt2/zotero-addons`](https://github.com/syt2/zotero-addons) (AGPL-3.0). The tag colours reuse its palette and hash (`src/utils/tagColor.ts`), so each tag has the same colour here as in the plugin.

This is an unofficial prototype, not maintained by syt2. If you'd like a similar feature integrated into the official project, see the discussion in the upstream issue tracker.
