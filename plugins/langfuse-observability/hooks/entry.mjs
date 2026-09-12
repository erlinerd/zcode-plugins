import { readConfig, isConfigured } from "./config.mjs";
import { LangfuseTraceSink } from "./langfuse.mjs";
import { JsonStateStore } from "./state.mjs";
import { NoopTraceSink, TurnTracker, parsePayload } from "./tracker.mjs";

function diagnostics(enabled, message) {
  if (enabled) process.stderr.write(`[langfuse-observability] ${message}\n`);
}

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

const config = readConfig();
const payload = parsePayload(raw);
const event = payload.hook_event_name || payload.hookEventName || "unknown";
const session = payload.session_id || payload.sessionId || "?";

diagnostics(config.debug, `event=${event} session=${session}`);

const sink = isConfigured(config)
  ? new LangfuseTraceSink(config)
  : new NoopTraceSink();
const tracker = new TurnTracker(new JsonStateStore(), sink, config);

try {
  await tracker.handle(payload);
} catch (error) {
  const kind = error instanceof Error ? error.name : "unknown";
  diagnostics(config.debug, `hook failed open (${kind})`);
}

process.stdout.write("{}\n");
