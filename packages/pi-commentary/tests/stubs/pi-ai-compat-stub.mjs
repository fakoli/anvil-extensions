// Test stub replacing @earendil-works/pi-ai/compat for wiring tests.
// Controlled via globalThis.__commentaryStub: { text, defer, stopReason, throwInResult, calls }.
export function stream(model, options, utils) {
  const state = globalThis.__commentaryStub;
  state.calls.push({ model, options });
  return {
    [Symbol.asyncIterator]() {
      return (async function* () {
        yield { type: "text_start", partial: null };
      })();
    },
    result: async () => {
      // state.defer IS the promise (not a {promise,resolve} handle).
      // Abort-aware: an external abort releases an otherwise never-resolving
      // wait so test suites cannot hang on abandoned requests.
      if (state.defer) {
        await new Promise((resolve) => {
          const onAbort = () => resolve();
          utils?.signal?.addEventListener?.("abort", onAbort, { once: true });
          state.defer.then(resolve, resolve);
        });
      }
      if (state.throwInResult) throw state.throwInResult;
      if (utils?.signal?.aborted) return { stopReason: "aborted", content: [] };
      return {
        stopReason: state.stopReason ?? "stop",
        content: [{ type: "text", text: state.text ?? "The agent fixed the failing test and validated the suite; next step is committing." }],
      };
    },
  };
}