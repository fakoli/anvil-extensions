import { describe, expect, it } from "vitest";
import { stripGrammarTokenLeaksInPlace } from "../src/index.js";

describe("stripGrammarTokenLeaksInPlace", () => {
  it("preserves a message_end write payload byte-for-byte when no marker leaked", () => {
    const args = { path: "note.txt", content: "fixed\n" };
    expect(stripGrammarTokenLeaksInPlace(args)).toBe(false);
    expect(args.content).toBe("fixed\n");
  });

  it("preserves leading indentation, multiline payloads, and nested arrays", () => {
    const args = { content: "  first\n    second\n", nested: ["  keep\n", { body: "\tindented\n" }] };
    expect(stripGrammarTokenLeaksInPlace(args)).toBe(false);
    expect(args).toEqual({ content: "  first\n    second\n", nested: ["  keep\n", { body: "\tindented\n" }] });
  });

  it("strips only explicit markers from keys, values, and nested string arrays", () => {
    const args: Record<string, unknown> = {
      "<arg_key>content</arg_key>": "<arg_value>fixed\n</arg_value>",
      values: ["<arg_value>  keep whitespace\n</arg_value>", { "<arg_key>line": "<arg_value>x</arg_value>" }],
    };
    expect(stripGrammarTokenLeaksInPlace(args)).toBe(true);
    expect(args).toEqual({ content: "fixed\n", values: ["  keep whitespace\n", { line: "x" }] });
  });

  it("does not overwrite an existing clean key when a leaked key collides", () => {
    const args: Record<string, unknown> = { content: "clean\n", "<arg_key>content": "leaked\n" };
    expect(stripGrammarTokenLeaksInPlace(args)).toBe(false);
    expect(args).toEqual({ content: "clean\n", "<arg_key>content": "leaked\n" });
  });
});
