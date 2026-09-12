# Langfuse Observability for ZCode

[中文文档](./README_CN.md)

A fail-open ZCode plugin that sends one Langfuse trace named `ZCode Turn` for
each completed turn. Tool calls are spans and the assistant response is a
generation.

## Behavior

The plugin listens to `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PostToolUseFailure`, and `Stop`. It publishes only at `Stop`.
It reads only fields delivered on ZCode Hook stdin. It never reads transcript
files and never collects hidden chain-of-thought.

Missing credentials, malformed Hook input, local-state errors, and Langfuse
errors are fail-open and must not block ZCode. Session state is stored under
`ZCODE_PLUGIN_DATA` when available, otherwise under the ZCode plugin data
fallback, and is cleaned up after a completed `Stop`.

Each of the six events starts a `node` process with the current user's
permissions. The process reads one JSON Hook event from stdin and writes one
empty JSON object to stdout; it does not spawn a shell or run user commands.
It reads `ZCODE_CONFIG_PATH`, or `~/.zcode/cli/config.json` when unset, to find
persisted options, writes only bounded hashed JSON session state, and sends
HTTPS requests to the configured Langfuse ingestion endpoint at `Stop`.

## Privacy and configuration

Content capture is bounded and controlled independently for prompts, tool input,
and tool output. Set these environment variables to disable content capture:

```text
LANGFUSE_CAPTURE_PROMPTS=false
LANGFUSE_CAPTURE_TOOL_INPUTS=false
LANGFUSE_CAPTURE_TOOL_OUTPUTS=false
```

Configuration precedence is process environment, persisted ZCode plugin options,
then defaults. Supported configuration includes:

```text
LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY
LANGFUSE_BASE_URL
LANGFUSE_USER_ID
LANGFUSE_ENVIRONMENT
LANGFUSE_RELEASE
LANGFUSE_ENABLED
LANGFUSE_CAPTURE_PROMPTS
LANGFUSE_CAPTURE_TOOL_INPUTS
LANGFUSE_CAPTURE_TOOL_OUTPUTS
LANGFUSE_MAX_CAPTURE_CHARS
LANGFUSE_DEBUG
```

`LANGFUSE_BASE_URL` defaults to `https://cloud.langfuse.com`. It must be an
HTTPS URL; plaintext HTTP is rejected and replaced with the default HTTPS
endpoint. The plugin sends telemetry only to that configured Langfuse endpoint
and writes only its bounded local session state. Never commit credentials or
private Hook payloads.

## Files and dependencies

The process Hook is declared in [`hooks/hooks.json`](./hooks/hooks.json) and
runs the reviewable source runtime at `hooks/entry.mjs`. When the optional
`langfuse` dependency is installed during local development, the runtime uses
the official JavaScript SDK. The published official cache is self-contained and
falls back to the same Langfuse HTTPS ingestion API through Node's built-in
`fetch`, so no install step is required.

## Source and license

Source repository: <https://github.com/erlinerd/zcode-langfuse-plugin>

Licensed under MIT. See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)
for the exact Langfuse SDK, Langfuse Core, and Mustache versions and their MIT
licenses. See the source repository for architecture, tests, release checks,
and the complete development history.
