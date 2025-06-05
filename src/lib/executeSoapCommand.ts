import { SOAP_USER, SOAP_PASSWORD, SOAP_ENDPOINT, SOAP_PORT } from '@azor.lib/conf.env';
import { TIP_ITEM_ID } from '@azor.lib/options.env';
import http from 'http'

export enum SOAP_COMMANDS {
	// Server Commands
	TIP_CHARACTER,
	TEST_COMMAND
}

const COMMANDS = {
	[SOAP_COMMANDS.TIP_CHARACTER]: `.additem $player_name ${TIP_ITEM_ID} 1`,
	[SOAP_COMMANDS.TEST_COMMAND]: ``
} as const

type commandArgs = {
	[SOAP_COMMANDS.TIP_CHARACTER]: { player_name: string },
	[SOAP_COMMANDS.TEST_COMMAND]: {}
};

type returnType = string | null;

export const executeSoapCommand = {
	[SOAP_COMMANDS.TIP_CHARACTER]: async ({ args }: { args: commandArgs[SOAP_COMMANDS.TIP_CHARACTER]}): Promise<returnType> => {
		return await execute({
			command: SOAP_COMMANDS.TIP_CHARACTER,
			args});
	},
	[SOAP_COMMANDS.TEST_COMMAND]: async ({ args }: { args: commandArgs[SOAP_COMMANDS.TEST_COMMAND] }): Promise<returnType> => {
		return null; // Placeholder for future commands
	}
}

const execute = async ({ command, args }: { command: SOAP_COMMANDS, args: commandArgs[SOAP_COMMANDS] }): Promise<returnType> => {

	let commandString = COMMANDS[command] as string;

	for (const [key, value] of Object.entries(args)) {
		commandString = commandString.replace(`$${key}`, String(value));
	}

	commandString = commandString.replace(/\$\d+/g, '').trim(); // Remove any remaining $<number> placeholders

	
	const data: { result: string } = await new Promise((resolve, reject) => {
		const req = http.request({
			port: SOAP_PORT,
			method: "POST",
			host: SOAP_ENDPOINT,
			auth: `${SOAP_USER}:${SOAP_PASSWORD}`,
			headers: { 'Content-Type': 'application/xml' }
		}, res => {
			res.on('data', async d => {
				resolve({
					result: d.toString()
				});
				return;
			})
		});
		req.write(
			'<SOAP-ENV:Envelope' +
			' xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"' +
			' xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"' +
			' xmlns:xsi="http://www.w3.org/1999/XMLSchema-instance"' +
			' xmlns:xsd="http://www.w3.org/1999/XMLSchema"' +
			' xmlns:ns1="urn:AC">' +
			'<SOAP-ENV:Body>' +
			'<ns1:executeCommand>' +
			'<command>' + commandString + '</command>' +
			'</ns1:executeCommand>' +
			'</SOAP-ENV:Body>' +
			'</SOAP-ENV:Envelope>'
		);
		req.end();
	});

	try {
		const plainTextResult = extractSoapResponse(data.result);

		return plainTextResult;

	} catch (error: any) {
		console.error('SOAP Error:', error.message);
	}

	return null;
}

const extractSoapResponse = (xmlResponse: string): string => {
	// Check for SOAP fault (error response)
	const faultMatch = xmlResponse.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
	if (faultMatch) {
		const faultString = faultMatch[1]
			.replace(/&#xD;/g, '')
			.trim();

		// Try to extract detail if exists
		const detailMatch = xmlResponse.match(/<detail>([\s\S]*?)<\/detail>/);
		const detail = detailMatch
			? detailMatch[1].replace(/&#xD;/g, '').trim()
			: 'No additional details';

		throw new Error(`SOAP Error: ${faultString}\n${detail}`);
	}

	// Extract successful result
	const resultMatch = xmlResponse.match(/<result>([\s\S]*?)<\/result>/);
	if (resultMatch) {
		return resultMatch[1]
			.replace(/&#xD;/g, '') 
			.trim();
	}

	throw new Error('Invalid SOAP response: No result found');
}

