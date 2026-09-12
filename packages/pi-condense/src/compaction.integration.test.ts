import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import extension from '../index.js';
import { ToolCallIndexer } from './indexer.js';

for (const mode of ['enabled', 'disabled', 'aborted'] as const) {
  test(`compaction reuses indexed summaries without changing saved history: ${mode}`, async () => {
    const agentDir = mkdtempSync(join(tmpdir(), 'pi-compact-'));
    const previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    try {
      writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({contextPrune: {
        enabled: mode !== 'disabled', chainCompression: {enabled: false}, recoveryGraceTurns: 0,
      }}));
      const raw = 'oversized tool result '.repeat(10000);
      const history: any[] = [
        {role: 'assistant', content: [{type: 'toolCall', id: 'call', name: 'bash', arguments: {command: 'test'}}]},
        {role: 'toolResult', toolCallId: 'call', toolName: 'bash', timestamp: 100, content: [{type: 'text', text: raw}]},
        {role: 'custom', customType: 'context-prune-summary', content: 'Saved result summary', timestamp: 101},
      ];
      const branch: any[] = history.map(message => ({type: 'message', message}));
      const indexer = new ToolCallIndexer();
      indexer.addBatch({turnIndex: 0, timestamp: 100, assistantText: '', toolCalls: [{
        toolCallId: 'call', toolName: 'bash', args: {command: 'test'}, resultText: raw,
        isError: false, resultTimestamp: 100,
      }]}, (customType, data) => branch.push({type: 'custom', customType, data}));
      const saved = JSON.stringify(branch);
      const handlers = new Map<string, Function>();
      extension({
        on: (name: string, handler: Function) => handlers.set(name, handler),
        registerTool() {}, registerCommand() {}, registerMessageRenderer() {}, appendEntry() {},
      } as any);
      await handlers.get('session_start')!({}, {sessionManager: {getBranch: () => branch}, ui: {setStatus() {}, setWidget() {}}});
      const preparation = {messagesToSummarize: history, turnPrefixMessages: history.slice(),
        firstKeptEntryId: 'retained', tokensBefore: 1000, previousSummary: 'Previous checkpoint',
        fileOps: {read: new Set(['file']), edited: new Set()}, settings: {reserveTokens: 100},
        retainedTail: {messages: [{role: 'user', content: 'Continue'}]}, isSplitTurn: true};
      const retained = preparation.retainedTail;
      const fileOps = preparation.fileOps;
      const controller = new AbortController();
      if (mode === 'aborted') controller.abort();
      expect(handlers.has('session_before_compact')).toBe(true);
      const result = await handlers.get('session_before_compact')!({preparation, signal: controller.signal});
      expect(result).toBeUndefined(); // Built-in summarization still owns completion.
      for (const messages of [preparation.messagesToSummarize, preparation.turnPrefixMessages]) {
        expect(JSON.stringify(messages).includes(raw)).toBe(mode !== 'enabled');
        expect(JSON.stringify(messages)).toContain('Saved result summary');
      }
      expect(JSON.stringify(branch)).toBe(saved);
      expect(preparation.firstKeptEntryId).toBe('retained');
      expect(preparation.previousSummary).toBe('Previous checkpoint');
      expect(preparation.tokensBefore).toBe(1000);
      expect(preparation.retainedTail).toBe(retained);
      expect(preparation.fileOps).toBe(fileOps);
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      rmSync(agentDir, {recursive: true, force: true});
    }
  });
}
