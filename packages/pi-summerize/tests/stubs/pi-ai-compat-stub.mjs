// Test stub replacing @earendil-works/pi-ai/compat for wiring tests.
// Controlled via globalThis.__summerizeStub: { text, defer, stopReason, throwInResult, calls }.
export function stream(model, options, utils) {
  const state = globalThis.__summerizeStub;
  state.calls.push({ model, options });
  return {
    [Symbol.asyncIterator]() {
      return (async function* () {
        yield { type: "text_start", partial: null };
      })();
    },
    result: async () => {
      // state.defer IS the promise (not a {promise,resolve} handle)
      if (state.defer) await state.defer;
      if (state.throwInResult) throw state.throwInResult;
      if (utils?.signal?.aborted) return { stopReason: "aborted", content: [] };
      return {
        stopReason: state.stopReason ?? "stop",
        content: [{ type: "text", text: state.text ?? "The agent fixed the failing test and validated the suite; next step is committing." }],
      };
    },
  };
}