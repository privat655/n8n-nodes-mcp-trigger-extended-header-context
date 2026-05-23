import type { IAuthenticateGeneric, ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

export class McpTriggerExtendedHeaderContextBearerAuthApi implements ICredentialType {
	name = 'mcpTriggerExtendedHeaderContextBearerAuthApi';

	displayName = 'MCP Trigger Extended Header Context Bearer Auth API';

	documentationUrl = 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger/';

	genericAuth = true;

	icon: Icon = 'file:../nodes/mcp.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'Bearer Token',
			name: 'token',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			resolvableField: true,
		},
		{
			displayName:
				'This credential uses the "Authorization" header. To use a custom header, use a "Custom Auth" credential instead',
			name: 'useCustomAuth',
			type: 'notice',
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.token}}',
			},
		},
	};
}
