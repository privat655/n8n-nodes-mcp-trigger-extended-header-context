import {
	McpServer,
	MCP_LIST_TOOLS_REQUEST_MARKER,
	prepareMcpTools,
	type McpToolSchemaOptions,
} from './McpServer';
import type { CompressionResponse } from './transport';
import {
	WebhookAuthorizationError,
	validateWebhookAuthentication,
} from '../../utils/webhookAuth';
import type { INodeTypeDescription, IWebhookFunctions, IWebhookResponseData } from 'n8n-workflow';
import { NodeConnectionTypes, Node, nodeNameToToolName } from 'n8n-workflow';

import { getConnectedTools } from '../../utils/helpers';

const MCP_SSE_SETUP_PATH = 'sse';
const MCP_SSE_MESSAGES_PATH = 'messages';

function parseOptionalParameterNames(value: unknown): string[] {
	if (typeof value !== 'string') return [];

	return Array.from(
		new Set(
			value
				.split(/[\n,]/)
				.map((name) => name.trim())
				.filter((name) => name.length > 0),
		),
	);
}

async function getPreparedConnectedTools(context: IWebhookFunctions) {
	const options: McpToolSchemaOptions = {
		optionalParameterNames: parseOptionalParameterNames(context.getNodeParameter('optionalParameters')),
		exposeMcpHeaderParameters: context.getNodeParameter('exposeMcpHeaderParameters') === true,
	};

	return prepareMcpTools(await getConnectedTools(context, true), options);
}

export class McpTriggerExtendedHeaderContext extends Node {
	description: INodeTypeDescription = {
		displayName: 'MCP Trigger Extended Header Context',
		name: 'mcpTriggerExtendedHeaderContext',
		icon: {
			light: 'file:../mcp.svg',
			dark: 'file:../mcp.dark.svg',
		},
		group: ['trigger'],
		version: [1, 1.1, 2],
		description: 'Expose n8n tools as an MCP Server endpoint',
		activationMessage:
			'You can now connect your MCP Clients to the URL, using SSE or Streamable HTTP transports.',
		defaults: {
			name: 'MCP Trigger Extended Header Context',
		},
		codex: {
			categories: ['AI', 'Core Nodes'],
			subcategories: {
				AI: ['Root Nodes', 'Model Context Protocol'],
				'Core Nodes': ['Other Trigger Nodes'],
			},
			alias: ['Model Context Protocol', 'MCP Server'],
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger/',
					},
				],
			},
		},
		triggerPanel: {
			header: 'Listen for MCP events',
			executionsHelp: {
				inactive:
					"This trigger has two modes: test and production.<br /><br /><b>Use test mode while you build your workflow</b>. Click the 'execute step' button, then make an MCP request to the test URL. The executions will show up in the editor.<br /><br /><b>Use production mode to run your workflow automatically</b>. Publish the workflow, then make requests to the production URL. These executions will show up in the <a data-key='executions'>executions list</a>, but not the editor.",
				active:
					"This trigger has two modes: test and production.<br /><br /><b>Use test mode while you build your workflow</b>. Click the 'execute step' button, then make an MCP request to the test URL. The executions will show up in the editor.<br /><br /><b>Use production mode to run your workflow automatically</b>. Since your workflow is activated, you can make requests to the production URL. These executions will show up in the <a data-key='executions'>executions list</a>, but not the editor.",
			},
			activationHint:
				"Once you've finished building your workflow, run it without having to click this button by using the production URL.",
		},
		inputs: [
			{
				type: NodeConnectionTypes.AiTool,
				displayName: 'Tools',
			},
		],
		outputs: [],
		credentials: [
			{
				name: 'mcpTriggerExtendedHeaderContextBearerAuthApi',
				required: true,
				testedBy: 'authentication',
				displayOptions: {
					show: {
						authentication: ['bearerAuth'],
					},
				},
			},
			{
				name: 'mcpTriggerExtendedHeaderContextHeaderAuthApi',
				required: true,
				testedBy: 'authentication',
				displayOptions: {
					show: {
						authentication: ['headerAuth'],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{ name: 'None', value: 'none' },
					{ name: 'Bearer Auth', value: 'bearerAuth' },
					{ name: 'Header Auth', value: 'headerAuth' },
				],
				default: 'none',
				description: 'The way to authenticate',
				builderHint: {
					propertyHint:
						"Default to 'none'. n8n exposes inbound trigger URLs publicly by design. Only select an authentication method when the user explicitly asks to authenticate inbound traffic.",
				},
			},
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '',
				placeholder: 'webhook',
				required: true,
				description: 'The base path for this MCP server',
			},
			{
				displayName: 'Expose X-MCP Parameters to Clients',
				name: 'exposeMcpHeaderParameters',
				type: 'boolean',
				default: false,
				description:
					'Whether to include x-mcp-* parameters in the MCP tool schemas returned to clients',
			},
			{
				displayName: 'Optional Parameters',
				name: 'optionalParameters',
				type: 'string',
				default: '',
				placeholder: 'customerId, x-mcp-userid',
				description:
					'Comma-separated or newline-separated parameter names to treat as optional when exposing and validating MCP tool calls',
				typeOptions: {
					rows: 3,
				},
			},
		],
		webhooks: [
			{
				name: 'setup',
				httpMethod: 'GET',
				responseMode: 'onReceived',
				isFullPath: true,
				path: `={{$parameter["path"]}}{{parseFloat($nodeVersion)<2 ? '/${MCP_SSE_SETUP_PATH}' : ''}}`,
				nodeType: 'mcp',
				ndvHideMethod: true,
				ndvHideUrl: false,
			},
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				isFullPath: true,
				path: `={{$parameter["path"]}}{{parseFloat($nodeVersion)<2 ? '/${MCP_SSE_MESSAGES_PATH}' : ''}}`,
				nodeType: 'mcp',
				ndvHideMethod: true,
				ndvHideUrl: true,
			},
			{
				name: 'default',
				httpMethod: 'DELETE',
				responseMode: 'onReceived',
				isFullPath: true,
				path: '={{$parameter["path"]}}',
				nodeType: 'mcp',
				ndvHideMethod: true,
				ndvHideUrl: true,
			},
		],
	};

	async webhook(context: IWebhookFunctions): Promise<IWebhookResponseData> {
		const webhookName = context.getWebhookName();
		const req = context.getRequestObject();
		const resp = context.getResponseObject() as unknown as CompressionResponse;

		try {
			await validateWebhookAuthentication(context, 'authentication');
		} catch (error) {
			if (error instanceof WebhookAuthorizationError) {
				resp.writeHead(error.responseCode);
				resp.end(error.message);
				return { noWebhookResponse: true };
			}
			throw error;
		}

		const node = context.getNode();
		const serverName = node.typeVersion > 1 ? nodeNameToToolName(node) : 'n8n-mcp-server';
		const mcpServer = McpServer.instance(context.logger);

		if (webhookName === 'setup') {
			const postUrl =
				node.typeVersion < 2
					? req.path.replace(new RegExp(`/${MCP_SSE_SETUP_PATH}$`), `/${MCP_SSE_MESSAGES_PATH}`)
					: req.path;

			const connectedTools = await getPreparedConnectedTools(context);
			await mcpServer.handleSetupRequest(req, resp, serverName, postUrl, connectedTools);

			return { noWebhookResponse: true };
		} else if (webhookName === 'default') {
			if (req.method === 'DELETE') {
				await mcpServer.handleDeleteRequest(req, resp);
			} else {
				const sessionId = mcpServer.getSessionId(req);

				context.logger.debug('MCP POST request received for existing session');

				if (sessionId) {
					const connectedTools = await getPreparedConnectedTools(context);
					const { wasToolCall, toolCallInfo, messageId, relaySessionId, needsListToolsRelay } =
						await mcpServer.handlePostMessage(req, resp, connectedTools, serverName);

					if (wasToolCall) {
						const workflowData = {
							...(toolCallInfo && { mcpToolCall: toolCallInfo }),
							...(messageId && { mcpMessageId: messageId }),
						};
						return { noWebhookResponse: true, workflowData: [[{ json: workflowData }]] };
					}

					if (needsListToolsRelay && relaySessionId && messageId) {
						const workflowData = {
							mcpListToolsRelay: {
								sessionId: relaySessionId,
								messageId,
								marker: MCP_LIST_TOOLS_REQUEST_MARKER,
							},
						};
						return { noWebhookResponse: true, workflowData: [[{ json: workflowData }]] };
					}
				} else {
					const connectedTools = await getPreparedConnectedTools(context);
					await mcpServer.handleStreamableHttpSetup(req, resp, serverName, connectedTools);
				}
			}

			return { noWebhookResponse: true };
		}

		return { workflowData: [[{ json: {} }]] };
	}
}
