import assert from "node:assert";
import { describe, it } from "vitest";
import { normalizeMemoryLookupText } from "../../src/store/memory-lookup.js";

describe("normalizeMemoryLookupText — echoed metadata comments", () => {
  it("strips a trailing metadata comment echoed from a raw entry", () => {
    const normalized = normalizeMemoryLookupText(
      "router detail <!-- created=2025-01-01, last=2025-09-09 -->",
    );
    assert.strictEqual(normalized, "router detail");
  });

  it("keeps ordinary content untouched", () => {
    assert.strictEqual(normalizeMemoryLookupText("router detail"), "router detail");
  });

  it("keeps non-trailing comments (only trailing metadata is stripped)", () => {
    const normalized = normalizeMemoryLookupText(
      "note <!-- aside --> about routers",
    );
    assert.strictEqual(normalized, "note <!-- aside --> about routers");
  });
});
