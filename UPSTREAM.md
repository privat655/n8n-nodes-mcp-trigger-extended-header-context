# Upstream Tracking

This package tracks n8n's official MCP Server Trigger and keeps custom behavior in a narrow adapter.

## Pinned Source

- Repository: https://github.com/n8n-io/n8n
- Release: `n8n@2.30.7`
- Commit: `1e2d027d6d239a55fc95598179e2a25d47e78c9b`
- Source: `packages/@n8n/nodes-langchain/nodes/mcp/McpTrigger`
- Compatibility: the MCP Trigger directory is identical between `n8n@2.30.5` and `n8n@2.30.7`

## Exact Copies

The following runtime files are byte-identical to `n8n@2.30.7`:

- `execution/DirectExecutionStrategy.ts`
- `execution/ExecutionCoordinator.ts`
- `execution/ExecutionStrategy.ts`
- `execution/PendingCallsManager.ts`
- `execution/QueuedExecutionStrategy.ts`
- `execution/index.ts`
- `protocol/MessageParser.ts`
- `protocol/index.ts`
- `protocol/types.ts`
- `session/InMemorySessionStore.ts`
- `session/RedisSessionStore.ts`
- `session/SessionManager.ts`
- `session/SessionStore.ts`
- `session/index.ts`
- `transport/SSETransport.ts`
- `transport/StreamableHttpTransport.ts`
- `transport/Transport.ts`
- `transport/TransportFactory.ts`
- `transport/index.ts`
- `index.ts`

`protocol/MessageFormatter.ts` copies upstream result formatting and error detection. Its credential-gate formatter is omitted because the corresponding built-in-only OAuth integration is not available to a renamed community node.

## Intentional Differences

`McpServer.ts` starts from the upstream implementation and has four adaptations:

1. It imports schema projection and header injection from `McpToolAdapter.ts`.
2. It injects declared `X-MCP-*` headers into both webhook-relayed and directly executed tool calls.
3. It uses the custom client-facing schema when listing tools.
4. It reads upstream's session TTL environment variables directly instead of importing n8n's internal dependency-injection container.

`McpTriggerExtendedHeaderContext.node.ts` starts from upstream `McpTrigger.node.ts` and changes:

- Node, class, display, and credential identities to avoid colliding with the built-in node.
- Monorepo-only imports to local standalone helpers.
- The default path to `={{$webhookId}}`.
- Two custom schema controls: `Optional Parameters` and `Expose X-MCP Parameters to Clients`.
- Connected tools are passed through `McpToolAdapter.ts` before entering the copied server.

## OAuth Exclusion

Upstream's `n8n User Auth (OAuth2)`, caller identity, private-credential gate, and execute-access option are intentionally omitted. In n8n 2.30.5, the supporting host logic recognizes only the built-in node type `@n8n/n8n-nodes-langchain.mcpTrigger`. Exposing those options from this renamed community node would compile but fail at runtime.

Bearer and header authentication remain available through package-local credential types and the upstream-derived `utils/webhookAuth.ts` adapter.

## Deployment Scope

n8n 2.30.5 also configures Redis sessions and queued execution only for the built-in MCP Trigger's singleton. This renamed community node therefore supports direct execution on a single main/webhook process; queue-mode or multi-main MCP routing requires corresponding host support for the community node type.

## Session Configuration

The upstream defaults and environment variable names are preserved:

- `N8N_MCP_SERVER_SESSION_IDLE_TTL_MS`: `3600000` milliseconds
- `N8N_MCP_SERVER_SESSION_SWEEP_INTERVAL_MS`: `300000` milliseconds

## Verification

Run:

```sh
npm test
npm run lint
npm run build
npm pack --dry-run
```

The tests cover header filtering and precedence, schema visibility and optionality, error signaling, pending-call protection, session activity, idle Streamable HTTP eviction, SSE preservation, node identity, and the deliberate OAuth exclusion.
