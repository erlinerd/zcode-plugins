# Third-party notices

The source runtime can use the following official npm packages when the plugin
is developed with dependencies installed. The self-contained official cache
fallback uses the same Langfuse public ingestion API through Node's built-in
`fetch`, so the published plugin does not require an install step.

| Package | Version | License | Source |
| --- | --- | --- | --- |
| `langfuse` | 3.38.20 | MIT | <https://github.com/langfuse/langfuse-js/tree/main/langfuse> |
| `langfuse-core` | 3.38.20 | MIT | <https://github.com/langfuse/langfuse-js/tree/main/langfuse-core> |
| `mustache` | 4.2.0 | MIT | <https://github.com/janl/mustache.js> |

The plugin sends telemetry to a user-configured Langfuse service over HTTPS.
That service is external to this repository and is governed by the service
operator's terms and privacy policy. No credentials are bundled or published.
