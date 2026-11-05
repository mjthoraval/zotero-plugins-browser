# Zotero Plugins Browser

A simple static webpage to browse the list of Zotero plugins from a browser, without installing Zotero or any plugin. It is a personal project, not affiliated with Zotero or the Zotero Plugins Atlas, and Zotero does not provide this data.

Live: **https://mjthoraval.github.io/zotero-plugins-browser/**

The plugin list comes from [`syt2/zotero-addons-scraper`](https://github.com/syt2/zotero-addons-scraper), the same source used by the in-Zotero [Zotero Addons](https://github.com/syt2/zotero-addons) plugin. The page fetches the published JSON live on each load, from raw GitHub with jsDelivr as a fallback, so it stays in sync with the scraper. Scheduled jobs in this repo add what the scraper doesn't carry: release dates, issue counts, XPI sizes and authors from GitHub, and ratings from the [Zotero Plugins Atlas](https://zoteroplugins.org).

## What it shows

Mirrors the Zotero Addons list view (minus the local-install columns):

- Name and author, as `Name [username]`: the name the plugin declares in its `manifest.json` or `package.json` (from `authors.json`, refreshed by a scheduled job, without downloading any XPI) or else the GitHub display name, then the GitHub username when the two differ
- Description
- ★ stars
- Rating: the plugin's grade on the [Zotero Plugins Atlas](https://zoteroplugins.org), which links to its page there, with the site's reason in a tooltip (from `atlas.json`, refreshed by a scheduled job); a dash when the site doesn't list the plugin. Matched on the GitHub repo, following renames, and never on the plugin ID, because forks share it
- Release date and latest version (for the chosen Zotero target)
- Tags
- XPI size, for the release linked on that row (from `xpi_sizes.json`, refreshed by a scheduled job; a release newer than the last run is looked up by the page from GitHub's release API, without downloading it)
- Direct XPI download link

Plugins whose newest release declares compatibility with a Zotero major that Zotero asks plugins not to declare yet (currently Zotero 11+: ["Do not update your plugin to declare compatibility with Zotero 11 at this time"](https://www.zotero.org/support/dev/zotero_11_for_developers#updating_plugin_compatibility)) are marked in red, with the declared maximum; the Zotero version selector stops at the allowed major (`ALLOWED_ZOTERO_MAJOR` in `index.html`, to raise when Zotero announces the next feature freeze).

Plus: search, tag filters, sort by stars / rating / date / name / XPI size, Zotero version selector, and a light/dark theme that follows the OS.

## Run it yourself

It's a single self-contained HTML file with no build step. Either:

- Open https://mjthoraval.github.io/zotero-plugins-browser/, or
- Clone this repo and open `index.html` in any browser.

## Credits

- Plugin metadata: [`syt2/zotero-addons-scraper`](https://github.com/syt2/zotero-addons-scraper) (CC0, scraped from each plugin's GitHub).
- Ratings and their reasons: Zotero Plugins Atlas, [zoteroplugins.org](https://zoteroplugins.org) (Ilias Beshimov), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `atlas.json` keeps the grade, the reason and the page slug from its catalogue, unchanged.
- In-Zotero counterpart: [`syt2/zotero-addons`](https://github.com/syt2/zotero-addons) (AGPL-3.0). The tag colours reuse its palette and hash (`src/utils/tagColor.ts`), so each tag has the same colour here as in the plugin.

This is an unofficial prototype, not maintained by syt2. If you'd like a similar feature integrated into the official project, see the discussion in the upstream issue tracker.
