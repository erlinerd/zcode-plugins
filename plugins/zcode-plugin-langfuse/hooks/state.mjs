import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const LOCK_WAIT_MS = 25;
const LOCK_ATTEMPTS = 160;
const STALE_LOCK_MS = 60_000;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function parseToolCall(value) {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isJsonValue(value.input) ||
    (value.output !== null && !isJsonValue(value.output)) ||
    (value.error !== null && typeof value.error !== "string") ||
    typeof value.startedAt !== "string" ||
    (value.endedAt !== null && typeof value.endedAt !== "string")
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    input: value.input,
    output: value.output,
    error: value.error,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
  };
}

function parseState(value) {
  if (!isRecord(value)) return null;
  if (
    value.version !== 1 ||
    typeof value.sessionId !== "string" ||
    typeof value.startedAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  let currentTurn = null;
  if (value.currentTurn !== null) {
    const turn = value.currentTurn;
    if (
      !isRecord(turn) ||
      typeof turn.id !== "string" ||
      (turn.prompt !== null && typeof turn.prompt !== "string") ||
      typeof turn.startedAt !== "string" ||
      !Array.isArray(turn.tools)
    ) {
      return null;
    }
    const tools = turn.tools.map(parseToolCall);
    if (tools.some((tool) => tool === null)) return null;
    currentTurn = {
      id: turn.id,
      prompt: turn.prompt,
      startedAt: turn.startedAt,
      tools,
    };
  }
  return {
    version: 1,
    sessionId: value.sessionId,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    currentTurn,
  };
}

function sessionKey(sessionId) {
  return createHash("sha256").update(sessionId).digest("hex");
}

function defaultDataDir() {
  return join(
    homedir() || tmpdir(),
    ".zcode",
    "cli",
    "plugins",
    "data",
    "zcode-plugin-langfuse",
  );
}

export class JsonStateStore {
  constructor(dataDir = process.env.ZCODE_PLUGIN_DATA || defaultDataDir()) {
    this.dataDir = dataDir;
  }

  async load(sessionId) {
    try {
      const contents = await readFile(this.statePath(sessionId), "utf8");
      return parseState(JSON.parse(contents));
    } catch {
      return null;
    }
  }

  async save(state) {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    const filePath = this.statePath(state.sessionId);
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(state), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  }

  async clear(sessionId) {
    await rm(this.statePath(sessionId), { force: true });
  }

  async withSessionLock(sessionId, task) {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    const lockPath = this.lockPath(sessionId);
    let acquired = false;

    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        await handle.close();
        acquired = true;
        break;
      } catch {
        await this.removeStaleLock(lockPath);
        await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS));
      }
    }

    if (!acquired) throw new Error("Timed out acquiring the Langfuse state lock");

    try {
      return await task();
    } finally {
      await rm(lockPath, { force: true });
    }
  }

  statePath(sessionId) {
    return join(this.dataDir, `${sessionKey(sessionId)}.json`);
  }

  lockPath(sessionId) {
    return join(this.dataDir, `${sessionKey(sessionId)}.lock`);
  }

  async removeStaleLock(lockPath) {
    try {
      const details = await stat(lockPath);
      if (Date.now() - details.mtimeMs > STALE_LOCK_MS)
        await rm(lockPath, { force: true });
    } catch {
      // The lock may disappear between open(), stat(), and rm().
    }
  }
}
