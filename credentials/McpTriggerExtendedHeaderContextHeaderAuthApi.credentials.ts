import type { IAuthenticateGeneric, ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

export class McpTriggerExtendedHeaderContextHeaderAuthApi implements ICredentialType {
	name = 'mcpTriggerExtendedHeaderContextHeaderAuthApi';

	displayName = 'MCP Trigger Extended Header Context Header Auth API';

	documentationUrl = 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger/';

	genericAuth = true;

	icon: Icon = 'file:../nodes/mcp.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Value',
			name: 'value',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
		},
		{
			displayName: 'To send multiple headers, use a "Custom Auth" credential instead',
			name: 'useCustomAuth',
			type: 'notice',
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'={{$credentials.name}}': '={{$credentials.value}}',
			},
		},
	};
}
