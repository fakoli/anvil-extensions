# Upstream contract

`pi-browser` is original Pi integration code. Its own package manifest pins the reviewed Serving adapter from `@anvil-serving/observations/browser` and Playwright for reproducible installation.

The adapter presents only `createLiveObservationAdapter({ launch, piSessionId, pages, jev })`. Its returned client supports `execute(request, { signal })` and `close()`. This package supplies the session ID and validated trusted configuration, translates only the four closed Pi tool inputs, and returns bounded text receipts. It does not create a model-provider client, read credentials, choose browser pages, or add network destinations.

The Serving adapter owns page capture, browser ownership, owner-session receipt validation, freshness, page coverage, and fixed Jev policy. The separate Node 24 worker owns the pinned Playwright launch handoff, framed process protocol, worker deadlines, and process lifecycle. Their boundary is deliberately narrow: Pi never receives a browser page object, screenshot, pixel buffer, raw media, or an arbitrary action channel. Changes to the adapter require Serving review; changes to the package pin or worker require the corresponding package review. Changes here must preserve this closed interface.
