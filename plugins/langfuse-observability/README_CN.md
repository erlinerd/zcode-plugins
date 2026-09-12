# ZCode Langfuse 观测插件

[English](./README.md)

这是一个 fail-open 的 ZCode 插件：每个完成的 turn 发送一条名为
`ZCode Turn` 的 Langfuse trace。工具调用记录为 span，助手回复记录为
generation。

## 行为

插件监听 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、
`PostToolUseFailure` 和 `Stop`，只在 `Stop` 时发布 trace。插件只读取
ZCode Hook stdin 传入的字段，不读取 transcript 文件，也不采集隐藏完整思维链。

缺少凭据、Hook 输入损坏、本地状态错误和 Langfuse 错误都采用 fail-open，
不能阻塞 ZCode。可用时，会在 `ZCODE_PLUGIN_DATA` 下保存会话状态，否则使用
ZCode 插件数据回退路径，并在完成 `Stop` 后清理。

六个事件都会以当前用户权限启动一个 `node` process Hook。Hook 从 stdin
读取一个 JSON 事件，并向 stdout 写入一个空 JSON 对象；不会启动 shell，也不会
执行用户命令。Hook 会读取 `ZCODE_CONFIG_PATH`；未设置时读取
`~/.zcode/cli/config.json` 中保存的插件选项，只写入有界、哈希化的 JSON 会话
状态，并在 `Stop` 时向配置的 Langfuse HTTPS 接口发送请求。

## 隐私与配置

内容采集有大小限制，并分别控制 prompt、工具输入和工具输出。关闭内容采集：

```text
LANGFUSE_CAPTURE_PROMPTS=false
LANGFUSE_CAPTURE_TOOL_INPUTS=false
LANGFUSE_CAPTURE_TOOL_OUTPUTS=false
```

配置优先级为进程环境变量、持久化的 ZCode 插件选项、默认值。支持的配置包括：

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

`LANGFUSE_BASE_URL` 默认是 `https://cloud.langfuse.com`，必须使用 HTTPS；明文
HTTP 会被拒绝并回退到默认 HTTPS 地址。插件只向配置的 Langfuse endpoint 发送
观测数据，只写入有大小限制的本地会话状态。不要提交凭据或私有 Hook payload。

## 文件与依赖

进程 Hook 声明在 [`hooks/hooks.json`](./hooks/hooks.json)，运行可审查的源代码
`hooks/entry.mjs`。本地开发安装可选的 `langfuse` 依赖时会使用官方 JavaScript
SDK；官方缓存中的插件使用 Node 内置 `fetch` 调用相同的 Langfuse HTTPS ingestion
API，因此不需要运行时安装步骤。

## 来源与许可证

源码仓库：<https://github.com/erlinerd/zcode-langfuse-plugin>

本插件采用 MIT 许可证。确切的 Langfuse SDK、Langfuse Core 和 Mustache 版本及
MIT 许可证见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。架构、测试、
发布检查和完整开发历史见源码仓库。
