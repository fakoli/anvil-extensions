// Minimal .env parser with python-dotenv parity for the cases the original
// plugin relies on: KEY=VALUE, optional `export ` prefix, single/double
// quotes (with escapes in double quotes), trailing comments outside quotes,
// blank lines, `#` comments, and multi-line quoted values.

export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    let raw = line.trim();
    if (raw === "" || raw.startsWith("#")) continue;
    raw = raw.replace(/^export\s+/, "");
    const eq = raw.indexOf("=");
    if (eq <= 0) continue;
    const key = raw.slice(0, eq).trim();
    if (!key) continue;
    let value = raw.slice(eq + 1).trimStart();
    const quote = value.startsWith('"') || value.startsWith("'") ? value[0] : null;
    if (quote) {
      value = value.slice(1);
      // Multi-line quoted values: keep consuming until the closing quote.
      let closed = false;
      while (!closed) {
        const end = value.indexOf(quote);
        if (end >= 0) {
          value = value.slice(0, end);
          closed = true;
        } else if (i < lines.length) {
          value += "\n" + lines[i];
          i += 1;
        } else {
          break; // unterminated: keep what we have
        }
      }
      if (quote === '"') {
        value = value
          .replace(/\\r/g, "\r")
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    } else {
      // Unquoted: strip a trailing comment after whitespace.
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash);
      value = value.trimEnd();
    }
    result[key] = value;
  }
  return result;
}