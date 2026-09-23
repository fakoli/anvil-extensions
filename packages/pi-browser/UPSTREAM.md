# Upstream contract

This package imports the reviewed dependency-free Serving adapter from `@anvil-serving/observations/browser`. The Node 24 worker owns the pinned Playwright launcher. The adapter interface is `createLiveObservationAdapter({ launch, piSessionId, pages, jev })`, returning `execute(request, { signal })` and `close()`.

The Serving package validates browser ownership, receipts, freshness, page coverage, and Jev policy. This package binds that closed interface to Pi tools and never creates a provider client or reads credentials.
