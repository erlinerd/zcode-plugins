import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_BASE_URL = "https://cloud.langfuse.com";
const DEFAULT_RELEASE = "0.1.1";
const DEFAULT_MAX_CAPTURE_CHARS = 20_000;

function asText(value) {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : String(value);
}

function firstNonEmpty(...values) {
  return values
    .map(asText)
    .find((value) => value !== undefined && value.trim().length > 0)
    ?.trim();
}

function userConfig(env, name) {
  const normalized = name.toUpperCase();
  return firstNonEmpty(
    env[`ZCODE_USER_CONFIG_${normalized}`],
    env[`ZCODE_PLUGIN_CONFIG_${normalized}`],
  );
}

function isStoredOption(value) {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function parseStoredOptions(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  const options = {};
  for (const [key, option] of Object.entries(value)) {
    if (isStoredOption(option)) options[key] = option;
  }
  return options;
}

function readStoredOptions(env) {
  const configPaths = [
    env.ZCODE_CONFIG_PATH,
    join(homedir(), ".zcode", "cli", "config.json"),
  ].filter(Boolean);
  const configuredPluginId = env.ZCODE_PLUGIN_ID;

  if (!configuredPluginId) return {};

  for (const configPath of configPaths) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf8"));
      const plugins = parsed?.plugins;
      const options = plugins?.options;
      if (
        !options ||
        typeof options !== "object" ||
        Array.isArray(options) ||
        !Object.prototype.hasOwnProperty.call(options, configuredPluginId)
      ) {
        continue;
      }
      return parseStoredOptions(options[configuredPluginId]);
    } catch {
      // A missing or unreadable user config must not block a ZCode hook.
    }
  }
  return {};
}

function option(env, storedOptions, name, environmentName) {
  return firstNonEmpty(
    userConfig(env, name),
    env[environmentName],
    storedOptions[name],
  );
}

function parseBoolean(value, fallback) {
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return fallback;
}

function parsePositiveInteger(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 1_000_000);
}

function normalizeBaseUrl(value) {
  const candidate = value ?? DEFAULT_BASE_URL;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return DEFAULT_BASE_URL;
    return candidate.replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE_URL;
  }
}

export function readConfig(env = process.env) {
  const storedOptions = readStoredOptions(env);
  const enabled = parseBoolean(
    option(env, storedOptions, "enabled", "LANGFUSE_ENABLED"),
    true,
  );
  const publicKey =
    option(env, storedOptions, "langfuse_public_key", "LANGFUSE_PUBLIC_KEY") ??
    null;
  const secretKey =
    option(env, storedOptions, "langfuse_secret_key", "LANGFUSE_SECRET_KEY") ??
    null;

  return {
    publicKey,
    secretKey,
    baseUrl: normalizeBaseUrl(
      option(env, storedOptions, "langfuse_base_url", "LANGFUSE_BASE_URL"),
    ),
    userId:
      option(env, storedOptions, "langfuse_user_id", "LANGFUSE_USER_ID") ?? null,
    environment:
      option(env, storedOptions, "langfuse_environment", "LANGFUSE_ENVIRONMENT") ??
      "development",
    release:
      option(env, storedOptions, "langfuse_release", "LANGFUSE_RELEASE") ??
      DEFAULT_RELEASE,
    enabled,
    capturePrompts: parseBoolean(
      option(env, storedOptions, "capture_prompts", "LANGFUSE_CAPTURE_PROMPTS"),
      true,
    ),
    captureToolInputs: parseBoolean(
      option(
        env,
        storedOptions,
        "capture_tool_inputs",
        "LANGFUSE_CAPTURE_TOOL_INPUTS",
      ),
      true,
    ),
    captureToolOutputs: parseBoolean(
      option(
        env,
        storedOptions,
        "capture_tool_outputs",
        "LANGFUSE_CAPTURE_TOOL_OUTPUTS",
      ),
      true,
    ),
    maxCaptureChars: parsePositiveInteger(
      option(
        env,
        storedOptions,
        "max_capture_chars",
        "LANGFUSE_MAX_CAPTURE_CHARS",
      ),
      DEFAULT_MAX_CAPTURE_CHARS,
    ),
    debug: parseBoolean(option(env, storedOptions, "debug", "LANGFUSE_DEBUG"), false),
  };
}

export function isConfigured(config) {
  return config.enabled && Boolean(config.publicKey && config.secretKey);
}
