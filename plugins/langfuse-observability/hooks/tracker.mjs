import { randomUUID } from "node:crypto";
import {
  assistantMessage,
  eventName,
  prompt,
  sessionId,
  toolError,
  toolId,
  toolInput,
  toolName,
  toolOutput,
} from "./extract.mjs";

function createSession(session, now) {
  return {
    version: 1,
    sessionId: session,
    startedAt: now,
    updatedAt: now,
    currentTurn: null,
  };
}

function createTurn(id, now, userPrompt) {
  return {
    id,
    prompt: userPrompt,
    startedAt: now,
    tools: [],
  };
}

const TRUNCATION_MARKER = "… [truncated]";

function truncate(value, maxChars) {
  if (value.length <= maxChars) return value;
  if (maxChars <= TRUNCATION_MARKER.length) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}

function boundedValue(value, maxChars) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxChars) return value;
  return truncate(serialized, maxChars);
}

function sanitizeTurn(turn, config) {
  return {
    ...turn,
    prompt:
      config.capturePrompts && turn.prompt !== null
        ? truncate(turn.prompt, config.maxCaptureChars)
        : null,
    assistantMessage:
      config.capturePrompts && turn.assistantMessage !== null
        ? truncate(turn.assistantMessage, config.maxCaptureChars)
        : null,
    tools: turn.tools.map((tool) => ({
      ...tool,
      name: truncate(tool.name, 256),
      input: config.captureToolInputs
        ? boundedValue(tool.input, config.maxCaptureChars)
        : null,
      output:
        config.captureToolOutputs && tool.output !== null
          ? boundedValue(tool.output, config.maxCaptureChars)
          : null,
      error:
        config.captureToolOutputs && tool.error !== null
          ? truncate(tool.error, config.maxCaptureChars)
          : null,
    })),
  };
}

function findTool(turn, id, name) {
  if (id) {
    const byId = turn.tools.find((tool) => tool.id === id);
    if (byId) return byId;
  }
  return (
    [...turn.tools].reverse().find((tool) => tool.endedAt === null && tool.name === name) ??
    [...turn.tools].reverse().find((tool) => tool.endedAt === null) ??
    null
  );
}

export class TurnTracker {
  constructor(
    stateStore,
    traceSink,
    config,
    clock = () => new Date(),
    idGenerator = randomUUID,
  ) {
    this.stateStore = stateStore;
    this.traceSink = traceSink;
    this.config = config;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async handle(payload) {
    const name = eventName(payload);
    const session = sessionId(payload);
    if (!name || !session) return;

    let completed = null;
    await this.stateStore.withSessionLock(session, async () => {
      const now = this.clock().toISOString();
      const existing =
        (await this.stateStore.load(session)) ?? createSession(session, now);

      switch (name) {
        case "SessionStart":
          existing.updatedAt = now;
          await this.stateStore.save(existing);
          return;
        case "UserPromptSubmit": {
          const userPrompt = prompt(payload);
          existing.currentTurn = createTurn(
            this.idGenerator(),
            now,
            this.config.capturePrompts && userPrompt !== null
              ? truncate(userPrompt, this.config.maxCaptureChars)
              : null,
          );
          existing.updatedAt = now;
          await this.stateStore.save(existing);
          return;
        }
        case "PreToolUse":
          this.recordToolStart(existing, payload, now);
          await this.stateStore.save(existing);
          return;
        case "PostToolUse":
          this.recordToolOutput(existing, payload, now, false);
          await this.stateStore.save(existing);
          return;
        case "PostToolUseFailure":
          this.recordToolOutput(existing, payload, now, true);
          await this.stateStore.save(existing);
          return;
        case "Stop":
          completed = sanitizeTurn(
            {
              sessionId: session,
              turnId: existing.currentTurn?.id ?? this.idGenerator(),
              prompt: existing.currentTurn?.prompt ?? null,
              assistantMessage: assistantMessage(payload),
              startedAt: existing.currentTurn?.startedAt ?? now,
              endedAt: now,
              tools: existing.currentTurn?.tools ?? [],
            },
            this.config,
          );
          await this.stateStore.clear(session);
          return;
        default:
          return;
      }
    });

    if (completed) await this.traceSink.publishTurn(completed);
  }

  recordToolStart(state, payload, now) {
    const turn =
      state.currentTurn ?? createTurn(this.idGenerator(), now, null);
    state.currentTurn = turn;
    turn.tools.push({
      id: toolId(payload) ?? this.idGenerator(),
      name: toolName(payload),
      input: this.config.captureToolInputs
        ? boundedValue(toolInput(payload), this.config.maxCaptureChars)
        : null,
      output: null,
      error: null,
      startedAt: now,
      endedAt: null,
    });
    state.updatedAt = now;
  }

  recordToolOutput(state, payload, now, failed) {
    const turn =
      state.currentTurn ?? createTurn(this.idGenerator(), now, null);
    state.currentTurn = turn;
    const name = toolName(payload);
    const tool = findTool(turn, toolId(payload), name);
    const output =
      !failed && this.config.captureToolOutputs
        ? boundedValue(toolOutput(payload), this.config.maxCaptureChars)
        : null;
    const error =
      failed && this.config.captureToolOutputs
        ? truncate(toolError(payload), this.config.maxCaptureChars)
        : null;
    if (tool) {
      tool.output = output;
      tool.error = error;
      tool.endedAt = now;
    } else {
      turn.tools.push({
        id: toolId(payload) ?? this.idGenerator(),
        name,
        input: null,
        output,
        error,
        startedAt: now,
        endedAt: now,
      });
    }
    state.updatedAt = now;
  }
}

export class NoopTraceSink {
  async publishTurn(_turn) {}
}

export function parsePayload(raw) {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}
