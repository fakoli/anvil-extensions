# pi-browser

`pi-browser` is an optional Linux Pi extension for bounded, read-only public-page observations. It is inactive unless a fresh session starts with `pi --browser` and a protected `pi-browser.json` is present in the Pi agent directory.

The private configuration supplies one or two same-origin HTTPS page IDs, the browser executable, and the fixed Jev policy. Tools accept only opaque owner references: `browser_capture`, `browser_resolve`, `browser_release`, and `browser_jev_resolve`. They return bounded text receipts. They cannot navigate to arbitrary URLs, run page code, take screenshots, export pixels, or mutate a page.

The protected configuration contains no credentials or router endpoint:

```json
{"browser_executable":"/opt/browser/chrome","pages":[{"id":"home","url":"https://example.test/"}],"jev":{"enabled":false},"timeout_ms":15000}
```

The configuration file and its agent directory must be owned by the Pi user, non-symlinked, and not group/world writable. Receipts are capped at 16 KiB. Capture uses the owner’s fixed eight-entity page and accepts `entity_offset` only from 0 through 2047; a partial page is never an absence claim.

The primary model receives no browser media. Browser state is bound to the Pi session and is closed on shutdown; fork and tree operations are refused while enabled.
