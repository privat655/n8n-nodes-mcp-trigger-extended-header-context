import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	{
		ignores: ['audit/**'],
	},
	{
		linterOptions: {
			reportUnusedDisableDirectives: 'off',
		},
	},
	...configWithoutCloudSupport,
	{
		files: ['package.json'],
		rules: {
			'n8n-nodes-base/community-package-json-license-not-default': 'off',
			'@n8n/community-nodes/no-runtime-dependencies': 'off',
		},
	},
	{
		files: ['nodes/McpTriggerExtendedHeaderContext/McpTriggerExtendedHeaderContext.node.ts'],
		rules: {
			'@n8n/community-nodes/node-usable-as-tool': 'off',
			'@n8n/community-nodes/require-node-description-fields': 'off',
			'@n8n/community-nodes/options-sorted-alphabetically': 'off',
			'@n8n/community-nodes/webhook-lifecycle-complete': 'off',
			'@n8n/community-nodes/require-node-api-error': 'off',
		},
	},
	{
		files: ['nodes/McpTriggerExtendedHeaderContext/execution/DirectExecutionStrategy.ts'],
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		},
	},
	{
		files: ['utils/webhookAuth.ts'],
		rules: {
			'no-prototype-builtins': 'off',
		},
	},
];
