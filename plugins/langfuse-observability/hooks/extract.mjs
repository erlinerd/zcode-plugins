function toJsonValue(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const values = value.map(toJsonValue);
    return values.every((item) => item !== undefined) ? values : undefined;
  }
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const parsed = toJsonValue(item);
      if (parsed === undefined) return undefined;
      result[key] = parsed;
    }
    return result;
  }
  return undefined;
}

function valueAt(payload, ...keys) {
  for (const key of keys) {
    const value = toJsonValue(payload[key]);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function asString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export function stringifyValue(value) {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  const json = JSON.stringify(value);
  return json ?? String(value);
}

export function eventName(payload) {
  return asString(
    valueAt(payload, "hook_event_name", "hookEventName", "event", "event_name"),
  );
}

export function sessionId(payload) {
  const value = asString(valueAt(payload, "session_id", "sessionId"));
  return value?.trim() || null;
}

export function prompt(payload) {
  const value = valueAt(payload, "prompt", "user_prompt", "userPrompt", "message");
  return value === undefined ? null : stringifyValue(value);
}

export function assistantMessage(payload) {
  const value = valueAt(payload, "last_assistant_message", "lastAssistantMessage");
  return value === undefined ? null : stringifyValue(value);
}

export function toolId(payload) {
  const value = asString(
    valueAt(payload, "tool_use_id", "toolUseId", "tool_id", "toolId", "id"),
  );
  return value?.trim() || null;
}

export function toolName(payload) {
  return (
    asString(valueAt(payload, "tool_name", "toolName", "name", "tool"))?.trim() ??
    "unknown"
  );
}

export function toolInput(payload) {
  return valueAt(payload, "tool_input", "toolInput", "input", "arguments") ?? null;
}

export function toolOutput(payload) {
  return (
    valueAt(
      payload,
      "tool_output",
      "toolOutput",
      "output",
      "result",
      "tool_response",
    ) ?? null
  );
}

export function toolError(payload) {
  return stringifyValue(
    valueAt(payload, "error", "error_message", "errorMessage", "message") ??
      "Tool failed",
  );
}
