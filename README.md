# n8n-nodes-mcp-trigger-extended-header-context

Community node package for an n8n MCP Server Trigger variant named `MCP Trigger Extended Header Context`.

It stays close to n8n's official MCP Server Trigger and adds one behavior: inbound HTTP headers whose names start with `X-MCP-` are injected into MCP tool-call arguments as lowercase keys. Server-side header values override LLM-provided arguments with the same key.

Install in n8n Community Nodes with package name `n8n-nodes-mcp-trigger-extended-header-context`.

## Publishing

Verified n8n community nodes must be published from GitHub Actions with npm provenance. This repo uses `.github/workflows/publish.yml` for tag-triggered releases.

Preferred setup: configure npm Trusted Publishing for GitHub Actions with owner `privat655`, repository `n8n-nodes-mcp-trigger-extended-header-context`, workflow filename `publish.yml`, and allowed action `npm publish`. No GitHub `NPM_TOKEN` secret is needed for this path.

Fallback setup: if the package does not exist on npm yet or Trusted Publishing is not configured, create a granular npm token with publish permission and store it in GitHub repository Actions secrets as `NPM_TOKEN`. After the package exists, configure Trusted Publishing and remove the secret.

## License

This package extends the code and assets from n8n's official MCP Server Trigger. See `LICENSE.md` and `NOTICE.md`.
