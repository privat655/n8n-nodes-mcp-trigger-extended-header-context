import { type DynamicStructuredTool, type StructuredTool, Tool } from '@langchain/core/tools';
import type { JSONSchema7 } from 'json-schema';
import type { IExecuteFunctions, ISupplyDataFunctions, IWebhookFunctions } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { ZodType } from 'zod';

import { convertJsonSchemaToZod } from './schemaParsing';

type ToolLike = Tool | DynamicStructuredTool | StructuredTool;
type ToolkitLike = { tools: ToolLike[] };
type N8nToolLike = Tool & { asDynamicTool: () => Tool };
type ZodLikeSchema = { _def?: unknown; _zod?: unknown; parse?: unknown; safeParse?: unknown };

function isToolkitLike(value: unknown): value is ToolkitLike {
	return typeof value === 'object' && value !== null && Array.isArray((value as ToolkitLike).tools);
}

function hasDynamicToolAdapter(tool: Tool): tool is N8nToolLike {
	return 'asDynamicTool' in tool && typeof tool.asDynamicTool === 'function';
}

function isZodLikeSchema(schema: unknown): boolean {
	if (schema instanceof ZodType) return true;
	if (typeof schema !== 'object' || schema === null) return false;

	const candidate = schema as ZodLikeSchema;
	const hasZodInternals = '_def' in candidate || '_zod' in candidate;
	const hasParser = typeof candidate.parse === 'function' || typeof candidate.safeParse === 'function';

	return hasZodInternals && hasParser;
}

export function escapeSingleCurlyBrackets(text?: string): string | undefined {
	if (text === undefined) return undefined;

	return text
		.replace(/(?<!{){{{(?!{)/g, '{{{{')
		.replace(/(?<!})}}}(?!})/g, '}}}}')
		.replace(/(?<!{){(?!{)/g, '{{')
		.replace(/(?<!})}(?!})/g, '}}');
}

const normalizeToolSchema = (tool: ToolLike) => {
	if (tool instanceof Tool) {
		return tool;
	}
	if (tool.schema && !isZodLikeSchema(tool.schema)) {
		tool.schema = convertJsonSchemaToZod(tool.schema as JSONSchema7);
	}

	return tool as Tool;
};

export const getConnectedTools = async (
	ctx: IExecuteFunctions | IWebhookFunctions | ISupplyDataFunctions,
	enforceUniqueNames: boolean,
	convertStructuredTool: boolean = true,
	escapeCurlyBrackets: boolean = false,
): Promise<Tool[]> => {
	const toolkitConnections = (await ctx.getInputConnectionData(
		NodeConnectionTypes.AiTool,
		0,
	)) as Array<ToolLike | ToolkitLike>;

	const parentNodes =
		'getParentNodes' in ctx
			? ctx
					.getParentNodes(ctx.getNode().name, {
						connectionType: NodeConnectionTypes.AiTool,
						depth: 1,
					})
					.filter((node) => !node.disabled)
			: [];

	const connectedTools = (toolkitConnections ?? [])
		.flatMap((toolOrToolkit, index) => {
			if (isToolkitLike(toolOrToolkit)) {
				return toolOrToolkit.tools.map((tool) => {
					const sourceNode = parentNodes[index] ?? tool.name;

					tool.metadata ??= {};
					tool.metadata.isFromToolkit = true;
					tool.metadata.sourceNodeName = sourceNode?.name;
					return tool;
				});
			}

			const sourceNode = parentNodes[index] ?? toolOrToolkit.name;
			toolOrToolkit.metadata ??= {};
			toolOrToolkit.metadata.isFromToolkit = false;
			toolOrToolkit.metadata.sourceNodeName = sourceNode?.name;
			return toolOrToolkit;
		})
		.map(normalizeToolSchema);

	if (!enforceUniqueNames) return connectedTools;

	const seenNames = new Set<string>();
	const finalTools: Tool[] = [];

	for (const tool of connectedTools) {
		const { name } = tool;
		if (seenNames.has(name)) {
			throw new NodeOperationError(
				ctx.getNode(),
				`You have multiple tools with the same name: '${name}', please rename them to avoid conflicts`,
			);
		}
		seenNames.add(name);

		if (escapeCurlyBrackets) {
			tool.description = escapeSingleCurlyBrackets(tool.description) ?? tool.description;
		}

		if (convertStructuredTool && hasDynamicToolAdapter(tool)) {
			finalTools.push(tool.asDynamicTool());
		} else {
			finalTools.push(tool);
		}
	}

	return finalTools;
};
