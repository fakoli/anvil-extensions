// Deliberately tiny stdio fixture. It records only actual tool-call messages.
let calls = 0;
process.stdout.write(`${JSON.stringify({ ready: true })}\n`);
process.stdin.setEncoding("utf8");
let buffered = "";
process.stdin.on("data", (chunk) => {
  buffered += chunk;
  let end;
  while ((end = buffered.indexOf("\n")) >= 0) {
    const line = buffered.slice(0, end); buffered = buffered.slice(end + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.method === "tools/call") calls++;
    if (message.method === "fixture/count") process.stdout.write(`${JSON.stringify({ calls })}\n`);
  }
});
