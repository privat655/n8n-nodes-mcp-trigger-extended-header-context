const assert = require('node:assert/strict');
const { after, test } = require('node:test');

const { z } = require('zod');

const {
	getClientFacingInputSchema,
	mergeMcpHeaderArguments,
	prepareMcpTools,
} = require('../dist/nodes/McpTriggerExtendedHeaderContext/McpToolAdapter');
const {
	PendingCallsManager,
} = require('../dist/nodes/McpTriggerExtendedHeaderContext/execution/PendingCallsManager');
const {
	MessageFormatter,
} = require('../dist/nodes/McpTriggerExtendedHeaderContext/protocol/MessageFormatter');
const {
	InMemorySessionStore,
} = require('../dist/nodes/McpTriggerExtendedHeaderContext/session/InMemorySessionStore');
const {
	SessionManager,
} = require('../dist/nodes/McpTriggerExtendedHeaderContext/session/SessionManager');

const logger = {
	debug() {},
	error() {},
	warn() {},
};

function getMcpServer() {
	const {
		McpServer,
	} = require('../dist/nodes/McpTriggerExtendedHeaderContext/McpServer');
	return McpServer.instance(logger);
}

function createTool() {
	return {
		name: 'lookup_customer',
		description: 'Looks up a customer',
		metadata: { sourceNodeName: 'Customer lookup' },
		schema: z.object({
			customerId: z.string(),
			'x-mcp-user-id': z.string(),
			'x-mcp-roles': z.string().optional(),
		}),
	};
}

test('X-MCP headers override only matching declared tool arguments', () => {
	const tool = createTool();
	const originalArguments = {
		customerId: 'customer-1',
		'x-mcp-user-id': 'model-value',
	};

	const merged = mergeMcpHeaderArguments(
		originalArguments,
		{
			'X-MCP-User-ID': 'server-value',
			'x-mcp-roles': ['admin', 'billing'],
			'x-mcp-undeclared': 'ignored',
			'x-mcp-': 'ignored',
			authorization: 'ignored',
			cookie: 'ignored',
			'mcp-session-id': 'ignored',
		},
		tool,
	);

	assert.deepEqual(merged, {
		customerId: 'customer-1',
		'x-mcp-user-id': 'server-value',
		'x-mcp-roles': 'admin, billing',
	});
	assert.deepEqual(originalArguments, {
		customerId: 'customer-1',
		'x-mcp-user-id': 'model-value',
	});
});

test('client schemas hide X-MCP parameters by default without mutating the tool', () => {
	const tool = createTool();
	const schema = getClientFacingInputSchema(tool);

	assert.deepEqual(Object.keys(schema.properties), ['customerId']);
	assert.deepEqual(schema.required, ['customerId']);
	assert.equal(tool.schema.safeParse({ customerId: '1' }).success, false);
});

test('prepared tools can expose header parameters and relax selected validation fields', () => {
	const tool = createTool();
	const [prepared] = prepareMcpTools([tool], {
		optionalParameterNames: ['customerId', 'x-mcp-user-id', 'customerId'],
		exposeMcpHeaderParameters: true,
	});
	const schema = getClientFacingInputSchema(prepared);

	assert.notEqual(prepared, tool);
	assert.equal(tool.schema.safeParse({}).success, false);
	assert.equal(prepared.schema.safeParse({}).success, true);
	assert.deepEqual(Object.keys(schema.properties), [
		'customerId',
		'x-mcp-user-id',
		'x-mcp-roles',
	]);
	assert.equal(schema.required, undefined);
});

test('upstream result formatting marks direct and queue errors as MCP errors', () => {
	const directError = 'NodeApiError: Bad request';
	const queueError = { error: { name: 'NodeApiError', message: 'Bad request' } };

	assert.equal(MessageFormatter.isErrorResult(directError), true);
	assert.equal(MessageFormatter.isErrorResult(queueError), true);
	assert.equal(MessageFormatter.isErrorResult('Lookup complete'), false);
	assert.deepEqual(MessageFormatter.formatToolResult(directError, true), {
		isError: true,
		content: [{ type: 'text', text: directError }],
	});
});

test('webhook relay boundary injects X-MCP headers into parsed tool-call data', async () => {
	const {
		DirectExecutionStrategy,
	} = require('../dist/nodes/McpTriggerExtendedHeaderContext/execution/DirectExecutionStrategy');
	const {
		QueuedExecutionStrategy,
	} = require('../dist/nodes/McpTriggerExtendedHeaderContext/execution/QueuedExecutionStrategy');
	const mcpServer = getMcpServer();
	const tool = createTool();
	const response = {
		statusCode: undefined,
		status(code) {
			this.statusCode = code;
			return this;
		},
		send() {},
	};
	const request = {
		headers: { 'X-MCP-User-ID': 'server-value' },
		query: { sessionId: 'remote-session' },
		rawBody: Buffer.from(
			JSON.stringify({
				jsonrpc: '2.0',
				id: 'request-1',
				method: 'tools/call',
				params: {
					name: tool.name,
					arguments: { customerId: 'customer-1', 'x-mcp-user-id': 'model-value' },
				},
			}),
		),
	};

	mcpServer.setExecutionStrategy(new QueuedExecutionStrategy(mcpServer.pendingCallsManager));
	try {
		const result = await mcpServer.handlePostMessage(request, response, [tool]);
		assert.equal(response.statusCode, 202);
		assert.deepEqual(result.toolCallInfo.arguments, {
			customerId: 'customer-1',
			'x-mcp-user-id': 'server-value',
		});
	} finally {
		mcpServer.setExecutionStrategy(new DirectExecutionStrategy());
	}
});

test('MCP SDK handler boundary injects requestInfo X-MCP headers before execution', async () => {
	const { CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
	const mcpServer = getMcpServer();
	let callToolHandler;
	let receivedArguments;
	const server = {
		async close() {},
		setRequestHandler(schema, handler) {
			if (schema === CallToolRequestSchema) callToolHandler = handler;
		},
	};
	const tool = {
		...createTool(),
		async invoke(args) {
			receivedArguments = args;
			return 'complete';
		},
	};

	await mcpServer.sessionManager.registerSession(
		'direct-session',
		server,
		{ transportType: 'streamableHttp' },
		[tool],
	);
	mcpServer.setupHandlers(server);
	assert.equal(typeof callToolHandler, 'function');

	const result = await callToolHandler(
		{
			params: {
				name: tool.name,
				arguments: { customerId: 'customer-1', 'x-mcp-user-id': 'model-value' },
			},
		},
		{
			sessionId: 'direct-session',
			requestId: 'request-1',
			requestInfo: { headers: { 'X-MCP-User-ID': 'server-value' } },
		},
	);

	assert.deepEqual(receivedArguments, {
		customerId: 'customer-1',
		'x-mcp-user-id': 'server-value',
	});
	assert.deepEqual(result, { content: [{ type: 'text', text: 'complete' }] });
	await mcpServer.sessionManager.destroySession('direct-session');
});

test('upstream pending-call tracking identifies in-flight work by session', async () => {
	const manager = new PendingCallsManager();
	const resultPromise = manager.waitForResult('session-1_request-1', 'lookup', {}, 1_000);

	assert.equal(manager.hasForSession('session-1'), true);
	assert.equal(manager.hasForSession('session-2'), false);
	manager.resolve('session-1_request-1', 'complete');
	assert.equal(await resultPromise, 'complete');
	assert.equal(manager.hasForSession('session-1'), false);
});

test('upstream session lifecycle tracks activity and closes destroyed servers', async () => {
	const manager = new SessionManager(new InMemorySessionStore());
	let closeCalls = 0;
	const server = {
		close: async () => {
			closeCalls += 1;
		},
	};
	const transport = { transportType: 'streamableHttp' };

	await manager.registerSession('session-1', server, transport);
	manager.getSession('session-1').lastActivityAt = 1_000;
	assert.deepEqual(manager.getIdleSessions(500, 1_500), ['session-1']);

	manager.touch('session-1');
	assert.deepEqual(manager.getIdleSessions(500), []);

	await manager.destroySession('session-1');
	assert.equal(closeCalls, 1);
	assert.equal(manager.getSession('session-1'), undefined);
});

test('upstream idle sweep evicts only inactive Streamable HTTP sessions', async () => {
	process.env.N8N_MCP_SERVER_SESSION_IDLE_TTL_MS = '1';
	process.env.N8N_MCP_SERVER_SESSION_SWEEP_INTERVAL_MS = '60000';
	const mcpServer = getMcpServer();
	const sessionManager = mcpServer.sessionManager;
	let streamableCloseCalls = 0;
	let pendingCloseCalls = 0;
	const createServer = (onClose) => ({ close: async () => onClose() });

	await sessionManager.registerSession(
		'idle-streamable',
		createServer(() => {
			streamableCloseCalls += 1;
		}),
		{ transportType: 'streamableHttp' },
	);
	await sessionManager.registerSession(
		'idle-sse',
		createServer(() => {}),
		{ transportType: 'sse' },
	);
	await sessionManager.registerSession(
		'pending-streamable',
		createServer(() => {
			pendingCloseCalls += 1;
		}),
		{ transportType: 'streamableHttp' },
	);
	for (const sessionId of ['idle-streamable', 'idle-sse', 'pending-streamable']) {
		sessionManager.getSession(sessionId).lastActivityAt = 0;
	}

	const pendingResult = mcpServer.pendingCallsManager.waitForResult(
		'pending-streamable_request-1',
		'lookup',
		{},
		1_000,
	);
	await mcpServer.runSweep();

	assert.equal(sessionManager.getSession('idle-streamable'), undefined);
	assert.ok(sessionManager.getSession('idle-sse'));
	assert.ok(sessionManager.getSession('pending-streamable'));
	assert.equal(streamableCloseCalls, 1);

	mcpServer.pendingCallsManager.resolve('pending-streamable_request-1', 'complete');
	await pendingResult;
	await mcpServer.runSweep();
	assert.equal(sessionManager.getSession('pending-streamable'), undefined);
	assert.equal(pendingCloseCalls, 1);

	await sessionManager.destroySession('idle-sse');
	mcpServer.stopSweep();
});

test('node description preserves custom identity and excludes unsupported built-in OAuth', () => {
	const {
		McpTriggerExtendedHeaderContext,
	} = require('../dist/nodes/McpTriggerExtendedHeaderContext/McpTriggerExtendedHeaderContext.node');
	const description = new McpTriggerExtendedHeaderContext().description;
	const authentication = description.properties.find((property) => property.name === 'authentication');
	const path = description.properties.find((property) => property.name === 'path');

	assert.equal(description.name, 'mcpTriggerExtendedHeaderContext');
	assert.equal(path.default, '={{$webhookId}}');
	assert.equal(authentication.options.some((option) => option.value === 'n8nOAuth2'), false);
	assert.ok(description.properties.some((property) => property.name === 'optionalParameters'));
	assert.ok(
		description.properties.some((property) => property.name === 'exposeMcpHeaderParameters'),
	);
});

after(() => {
	delete process.env.N8N_MCP_SERVER_SESSION_IDLE_TTL_MS;
	delete process.env.N8N_MCP_SERVER_SESSION_SWEEP_INTERVAL_MS;
});
