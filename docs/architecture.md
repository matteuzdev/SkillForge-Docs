# Architecture

`Source -> Discovery -> Fetch/Render -> Parse -> Classify -> Knowledge -> Skill Compiler -> ZIP`

## Fetch strategy

1. Try a normal HTTP fetch.
2. Parse the returned HTML.
3. If the extracted body is too thin, open the URL in a background Chrome tab.
4. Wait for the browser-rendered DOM.
5. Parse the rendered HTML instead.

This keeps fast static documentation cheap while supporting JavaScript-heavy portals.
