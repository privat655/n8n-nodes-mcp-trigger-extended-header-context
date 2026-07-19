import type { Tool } from '@langchain/core/tools';
import { zodToJsonSchema } from 'zod-to-json-schema';

type HeaderMap = Record<string, string | string[] | undefined>;
type JsonObjectSchema = {
	type?: unknown;
	properties?: unknown;
	required?: unknown;
	[key: string]: unknown;
};
type ClientInputSchema = {
	type: 'object';
	properties?: Record<string, unknown>;
	required?: string[];
	[key: string]: unknown;
};
type ZodObjectLike = {
	shape?: unknown;
	_def?: { shape?: unknown };
	partial?: unknown;
};

const MCP_HEADER_PREFIX = 'x-mcp-';
export const MCP_TOOL_SCHEMA_OPTIONS_METADATA_KEY =
	'mcpTriggerExtendedHeaderContext.schemaOptions';

export interface McpToolSchemaOptions {
	optionalParameterNames?: string[];
	exposeMcpHeaderParameters?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMcpToolSchemaOptions(options?: McpToolSchemaOptions): Required<McpToolSchemaOptions> {
	return {
		optionalParameterNames: Array.from(new Set(options?.optionalParameterNames ?? [])),
		exposeMcpHeaderParameters: options?.exposeMcpHeaderParameters === true,
	};
}

function getMcpToolSchemaOptions(tool: Tool): Required<McpToolSchemaOptions> {
	const metadata = isRecord(tool.metadata) ? tool.metadata : {};
	const options = metadata[MCP_TOOL_SCHEMA_OPTIONS_METADATA_KEY];
	if (!isRecord(options)) return normalizeMcpToolSchemaOptions();

	return normalizeMcpToolSchemaOptions({
		optionalParameterNames: Array.isArray(options.optionalParameterNames)
			? options.optionalParameterNames.filter((name): name is string => typeof name === 'string')
			: [],
		exposeMcpHeaderParameters: options.exposeMcpHeaderParameters === true,
	});
}

function getZodObjectShape(schema: unknown): Record<string, unknown> | undefined {
	if (!isRecord(schema)) return undefined;

	const candidate = schema as ZodObjectLike;
	const shape = typeof candidate.shape === 'function' ? candidate.shape() : candidate.shape;
	if (isRecord(shape)) return shape;

	const defShape = candidate._def?.shape;
	const resolvedDefShape = typeof defShape === 'function' ? defShape() : defShape;
	return isRecord(resolvedDefShape) ? resolvedDefShape : undefined;
}

function relaxZodObjectSchema(schema: unknown, optionalParameterNames: Set<string>): unknown {
	const shape = getZodObjectShape(schema);
	if (!shape || !isRecord(schema)) return schema;

	const mask = Object.fromEntries(
		Object.keys(shape)
			.filter((name) => optionalParameterNames.has(name))
			.map((name) => [name, true]),
	);
	if (Object.keys(mask).length === 0) return schema;

	const partial = (schema as ZodObjectLike).partial;
	if (typeof partial !== 'function') return schema;

	return partial.call(schema, mask);
}

function relaxJsonObjectSchema(schema: unknown, optionalParameterNames: Set<string>): unknown {
	if (!isRecord(schema)) return schema;

	const required = Array.isArray(schema.required)
		? schema.required.filter((name): name is string => typeof name === 'string')
		: [];
	if (required.length === 0) return schema;

	const nextRequired = required.filter((name) => !optionalParameterNames.has(name));
	if (nextRequired.length === required.length) return schema;

	const nextSchema: JsonObjectSchema = { ...schema };
	if (nextRequired.length > 0) {
		nextSchema.required = nextRequired;
	} else {
		delete nextSchema.required;
	}

	return nextSchema;
}

function relaxToolSchemaParameters(schema: unknown, optionalParameterNames: string[]): unknown {
	if (optionalParameterNames.length === 0) return schema;

	const optionalParameterNameSet = new Set(optionalParameterNames);
	const relaxedZodSchema = relaxZodObjectSchema(schema, optionalParameterNameSet);
	if (relaxedZodSchema !== schema) return relaxedZodSchema;

	return relaxJsonObjectSchema(schema, optionalParameterNameSet);
}

function cloneTool(tool: Tool): Tool {
	const clonedTool = Object.create(Object.getPrototypeOf(tool)) as Tool;
	Object.defineProperties(clonedTool, Object.getOwnPropertyDescriptors(tool));
	return clonedTool;
}

export function prepareMcpTools(tools: Tool[], options?: McpToolSchemaOptions): Tool[] {
	const schemaOptions = normalizeMcpToolSchemaOptions(options);
	const shouldAttachOptions =
		schemaOptions.optionalParameterNames.length > 0 || schemaOptions.exposeMcpHeaderParameters;
	if (!shouldAttachOptions) return tools;

	return tools.map((tool) => {
		const clonedTool = cloneTool(tool);
		const metadata = isRecord(tool.metadata) ? tool.metadata : {};

		clonedTool.schema = relaxToolSchemaParameters(
			tool.schema,
			schemaOptions.optionalParameterNames,
		) as typeof tool.schema;
		clonedTool.metadata = {
			...metadata,
			[MCP_TOOL_SCHEMA_OPTIONS_METADATA_KEY]: schemaOptions,
		};

		return clonedTool;
	});
}

export function getClientFacingInputSchema(tool: Tool): ClientInputSchema {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
	const schema = zodToJsonSchema(tool.schema as any, {
		removeAdditionalStrategy: 'strict',
	});
	if (!isRecord(schema)) return { type: 'object', properties: {} };

	const jsonSchema = schema as JsonObjectSchema;
	const options = getMcpToolSchemaOptions(tool);
	const properties = isRecord(jsonSchema.properties) ? jsonSchema.properties : undefined;
	const required = Array.isArray(jsonSchema.required)
		? jsonSchema.required.filter((name: unknown): name is string => typeof name === 'string')
		: undefined;
	const hiddenPropertyNames = new Set<string>();
	const nextSchema: ClientInputSchema = { ...jsonSchema, type: 'object', properties, required };

	if (properties && !options.exposeMcpHeaderParameters) {
		const nextProperties = { ...properties };
		for (const name of Object.keys(nextProperties)) {
			if (name.toLowerCase().startsWith(MCP_HEADER_PREFIX)) {
				hiddenPropertyNames.add(name);
				delete nextProperties[name];
			}
		}
		nextSchema.properties = nextProperties;
	}

	if (required) {
		const optionalParameterNames = new Set(options.optionalParameterNames);
		const clientRequired = required.filter(
			(name) => !optionalParameterNames.has(name) && !hiddenPropertyNames.has(name),
		);

		if (clientRequired.length > 0) {
			nextSchema.required = clientRequired;
		} else {
			delete nextSchema.required;
		}
	}

	return nextSchema;
}

function extractMcpHeaderArguments(headers?: HeaderMap): Record<string, string> {
	const headerArguments: Record<string, string> = {};

	for (const [name, value] of Object.entries(headers ?? {})) {
		const key = name.toLowerCase();
		if (!key.startsWith(MCP_HEADER_PREFIX) || key.length === MCP_HEADER_PREFIX.length) continue;
		if (value === undefined) continue;

		headerArguments[key] = Array.isArray(value) ? value.join(', ') : value;
	}

	return headerArguments;
}

function getToolArgumentNames(tool: Tool): Set<string> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
	const schema = zodToJsonSchema(tool.schema as any, {
		removeAdditionalStrategy: 'strict',
	});
	if (typeof schema !== 'object' || schema === null) return new Set();

	const properties = (schema as { properties?: unknown }).properties;
	if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
		return new Set();
	}

	return new Set(Object.keys(properties));
}

export function mergeMcpHeaderArguments(
	args: Record<string, unknown>,
	headers: HeaderMap | undefined,
	tool: Tool,
): Record<string, unknown> {
	const headerArguments = extractMcpHeaderArguments(headers);
	if (Object.keys(headerArguments).length === 0) return args;

	const toolArgumentNames = getToolArgumentNames(tool);
	const matchingHeaderArguments = Object.fromEntries(
		Object.entries(headerArguments).filter(([key]) => toolArgumentNames.has(key)),
	);
	if (Object.keys(matchingHeaderArguments).length === 0) return args;

	return { ...args, ...matchingHeaderArguments };
}
