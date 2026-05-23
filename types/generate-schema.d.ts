declare module 'generate-schema' {
	export interface SchemaObject {
		[key: string]: unknown;
	}

	export function json(value: unknown): SchemaObject;
}
