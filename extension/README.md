# SkillForge Docs

Chrome extension that transforms web knowledge sources into structured AI skills.

## V0.2

- crawls same-path or same-host sources;
- `Max pages = 0` means unlimited pages;
- `Depth = 0` means unlimited crawl depth;
- extracts headings, text, lists, tables and code;
- classifies pages into concept, how-to, API reference, architecture, troubleshooting, release notes and reference;
- detects thin/static HTML and falls back to a real Chrome-rendered page for JavaScript-heavy portals such as Oracle Learn;
- exports `SKILL.md`, knowledge pages, source registry and metadata as a ZIP;
- keeps source URLs for traceability.

## Install from this repository

1. Clone the repository.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select the `extension/` folder.

After future updates, run `git pull` and press **Reload** on the extension card.

## Scope

The project is not limited to documentation. The extraction engine is intended for technical docs, help centers, engineering blogs, academies, changelogs, wikis and other structured web knowledge sources.

## Safety and source fidelity

Use only sources you are allowed to access and reuse. Generated skills are snapshots; time-sensitive facts should be checked against the live official source.
