import { ApplicationError } from '@n8n/errors';
import type { ICredentialDataDecryptedObject, IDataObject, IWebhookFunctions } from 'n8n-workflow';

export class WebhookAuthorizationError extends ApplicationError {
	constructor(
		readonly responseCode: number,
		message?: string,
	) {
		if (message === undefined) {
			message = 'Authorization problem!';
			if (responseCode === 401) {
				message = 'Authorization is required!';
			} else if (responseCode === 403) {
				message = 'Authorization data is wrong!';
			}
		}
		super(message);
	}
}

export async function validateWebhookAuthentication(
	ctx: IWebhookFunctions,
	authPropertyName: string,
) {
	const authentication = ctx.getNodeParameter(authPropertyName, 'none') as string;
	if (authentication === 'none') return;

	const headers = ctx.getHeaderData();

	if (authentication === 'bearerAuth') {
		let expectedAuth: ICredentialDataDecryptedObject | undefined;
		try {
			expectedAuth = await ctx.getCredentials<ICredentialDataDecryptedObject>(
				'mcpTriggerExtendedHeaderContextBearerAuthApi',
			);
		} catch {
			// Matches upstream behavior: missing credentials are handled below.
		}

		const expectedToken = expectedAuth?.token as string;
		if (!expectedToken) {
			throw new WebhookAuthorizationError(500, 'No authentication data defined on node!');
		}

		if (headers.authorization !== `Bearer ${expectedToken}`) {
			throw new WebhookAuthorizationError(403);
		}
	} else if (authentication === 'headerAuth') {
		let expectedAuth: ICredentialDataDecryptedObject | undefined;
		try {
			expectedAuth = await ctx.getCredentials<ICredentialDataDecryptedObject>(
				'mcpTriggerExtendedHeaderContextHeaderAuthApi',
			);
		} catch {
			// Matches upstream behavior: missing credentials are handled below.
		}

		if (expectedAuth === undefined || !expectedAuth.name || !expectedAuth.value) {
			throw new WebhookAuthorizationError(500, 'No authentication data defined on node!');
		}

		const headerName = (expectedAuth.name as string).toLowerCase();
		const expectedValue = expectedAuth.value as string;

		if (!headers.hasOwnProperty(headerName) || (headers as IDataObject)[headerName] !== expectedValue) {
			throw new WebhookAuthorizationError(403);
		}
	}
}
