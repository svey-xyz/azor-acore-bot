import { soapParser } from './soapParser';
import { SOAP_USER, SOAP_PASSWORD, SOAP_ENDPOINT, SOAP_PORT } from './env';
import http from 'http'
import { SOAP_COMMANDS } from './soapCommands';

const SOAP_COMMANDS_MAP: Record<SOAP_COMMANDS, string> = {
	[SOAP_COMMANDS.GET_SERVER_INFO]: '',
	[SOAP_COMMANDS.GET_SERVER_STATUS]: '',
	[SOAP_COMMANDS.GET_ONLINE_CHARACTERS]: '.account onlinelist',
	[SOAP_COMMANDS.GET_CHARACTER_INFO]: '.cache info $player_name',
	[SOAP_COMMANDS.GET_GUILD_INFO]: '.guild info $guild_name',
	[SOAP_COMMANDS.GET_CHARACTER_LOCATION]: ''
}

type CommandArgs = Record<string, string | number>;

export const executeSoapCommand = async <T>({ command, args = {} }: { command: SOAP_COMMANDS, args: CommandArgs}): Promise<T | undefined> => {

	let commandString = SOAP_COMMANDS_MAP[command];

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
		const parsedData = soapParser<T>(command, plainTextResult);
		return parsedData;

	} catch (error: any) {
		console.error('SOAP Error:', error.message);
	}

	// return null;
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

