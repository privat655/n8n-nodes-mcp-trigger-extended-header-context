# n8n-nodes-mcp-trigger-extended-header-context

Community node package for an n8n MCP Server Trigger variant named `MCP Trigger Extended Header Context`.

It stays close to n8n's official MCP Server Trigger and adds one behavior: inbound HTTP headers whose names start with `X-MCP-` are injected into MCP tool-call arguments as lowercase keys. Server-side header values override LLM-provided arguments with the same key.

You can mark selected tool parameters as optional for MCP clients so omitted values do not fail tool validation. Header-backed `x-mcp-*` parameters are hidden from MCP clients by default while still being injected from inbound request headers on the server.

Install in n8n Community Nodes with package name `n8n-nodes-mcp-trigger-extended-header-context`.

## Subworkflows

When using this trigger with a subworkflow tool, configure subworkflow input parameters with the same lowercase names as the injected headers. For example, header `X-MCP-User-ID` is injected as `x-mcp-user-id`, so the subworkflow must define an input parameter named `x-mcp-user-id` to receive it.

## License

This package extends the code and assets from n8n's official MCP Server Trigger. See `LICENSE.md` and `NOTICE.md`.
