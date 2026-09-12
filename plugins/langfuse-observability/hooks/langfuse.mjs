import { randomUUID } from "node:crypto";

const SDK_INTEGRATION = "zcode-langfuse-observability";
const TRACE_NAME = "ZCode Turn";

function isMissingSdk(error) {
  return (
    error?.code === "ERR_MODULE_NOT_FOUND" ||
    (error instanceof Error && error.message.includes("Cannot find package 'langfuse'"))
  );
}

async function publishWithOfficialSdk(config, turn) {
  let Langfuse;
  try {
    ({ Langfuse } = await import("langfuse"));
  } catch (error) {
    if (isMissingSdk(error)) return false;
    throw error;
  }

  const client = new Langfuse({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
    release: config.release,
    environment: config.environment,
    sdkIntegration: SDK_INTEGRATION,
    flushAt: 1,
    fetchRetryCount: 1,
    requestTimeout: 8_000,
  });

  try {
    const trace = client.trace({
      name: TRACE_NAME,
      sessionId: turn.sessionId,
      input: turn.prompt,
      metadata: {
        source: "zcode",
        turnId: turn.turnId,
        toolCount: turn.tools.length,
      },
      tags: ["zcode", "zcode-hook"],
      ...(config.userId ? { userId: config.userId } : {}),
    });

    for (const tool of turn.tools) {
      const span = trace.span({
        name: `tool.${tool.name}`,
        input: tool.input,
        metadata: {
          toolId: tool.id,
          startedAt: tool.startedAt,
          endedAt: tool.endedAt,
        },
      });
      if (tool.error) {
        span.end({
          output: { error: tool.error },
          level: "ERROR",
          statusMessage: tool.error,
        });
      } else {
        span.end({ output: tool.output });
      }
    }

    const generation = trace.generation({
      name: "zcode.assistant",
      input: turn.prompt,
      metadata: { turnId: turn.turnId },
    });
    generation.end({ output: turn.assistantMessage });
    trace.update({
      output: turn.assistantMessage,
      metadata: {
        source: "zcode",
        turnId: turn.turnId,
        toolCount: turn.tools.length,
      },
    });
    await client.flushAsync();
  } finally {
    await client.shutdownAsync();
  }
  return true;
}

function queued(type, body, timestamp) {
  return {
    id: randomUUID(),
    type,
    timestamp,
    body,
  };
}

async function publishWithHttp(config, turn) {
  const timestamp = new Date().toISOString();
  const traceId = randomUUID();
  const metadata = {
    source: "zcode",
    turnId: turn.turnId,
    toolCount: turn.tools.length,
  };
  const batch = [
    queued(
      "trace-create",
      {
        id: traceId,
        name: TRACE_NAME,
        sessionId: turn.sessionId,
        timestamp,
        release: config.release,
        environment: config.environment,
        input: turn.prompt,
        metadata,
        tags: ["zcode", "zcode-hook"],
        ...(config.userId ? { userId: config.userId } : {}),
      },
      timestamp,
    ),
  ];

  for (const tool of turn.tools) {
    const startTime = tool.startedAt || timestamp;
    const endTime = tool.endedAt || timestamp;
    batch.push(
      queued(
        "span-create",
        {
          id: randomUUID(),
          traceId,
          name: `tool.${tool.name}`,
          startTime,
          endTime,
          input: tool.input,
          output: tool.error ? { error: tool.error } : tool.output,
          metadata: {
            toolId: tool.id,
            startedAt: tool.startedAt,
            endedAt: tool.endedAt,
          },
          ...(tool.error
            ? { level: "ERROR", statusMessage: tool.error }
            : {}),
        },
        timestamp,
      ),
    );
  }

  batch.push(
    queued(
      "generation-create",
      {
        id: randomUUID(),
        traceId,
        name: "zcode.assistant",
        startTime: turn.startedAt || timestamp,
        endTime: turn.endedAt || timestamp,
        input: turn.prompt,
        output: turn.assistantMessage,
        environment: config.environment,
        metadata: { turnId: turn.turnId },
      },
      timestamp,
    ),
    queued(
      "trace-update",
      {
        id: traceId,
        output: turn.assistantMessage,
        metadata,
      },
      timestamp,
    ),
  );

  const response = await fetch(`${config.baseUrl}/api/public/ingestion`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${config.publicKey}:${config.secretKey}`,
      ).toString("base64")}`,
      "Content-Type": "application/json",
      "X-Langfuse-Sdk-Name": "langfuse-js-compatible",
      "X-Langfuse-Sdk-Integration": SDK_INTEGRATION,
      "X-Langfuse-Public-Key": config.publicKey,
    },
    body: JSON.stringify({
      batch,
      metadata: {
        batch_size: batch.length,
        sdk_integration: SDK_INTEGRATION,
        sdk_name: "langfuse-js-compatible",
        public_key: config.publicKey,
      },
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Langfuse ingestion returned HTTP ${response.status}`);
  }
}

export class LangfuseTraceSink {
  constructor(config) {
    this.config = config;
  }

  async publishTurn(turn) {
    if (!this.config.publicKey || !this.config.secretKey) return;
    if (!(await publishWithOfficialSdk(this.config, turn))) {
      await publishWithHttp(this.config, turn);
    }
  }
}
