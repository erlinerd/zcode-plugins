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
`ZCODE_PLUGIN_DATA` when available and is cleaned up after a completed `Stop`.

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

`LANGFUSE_BASE_URL` defaults to `https://cloud.langfuse.com`. The plugin sends
telemetry only to that configured Langfuse endpoint and writes only its bounded
local session state. Never commit credentials or private Hook payloads.

## Files and dependencies

The process Hook is declared in [`hooks/hooks.json`](./hooks/hooks.json) and
runs the bundled runtime at `dist/hooks/entry.mjs`. The runtime bundles the
official `langfuse` JavaScript SDK. No runtime installation step is required.

## Source and license

Source repository: <https://github.com/erlinerd/zcode-langfuse-plugin>

Licensed under MIT. See the source repository for architecture, tests, release
checks, and the complete development history.
