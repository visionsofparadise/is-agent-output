#!/usr/bin/env node

import { detectAgentOutput } from "./detectAgentOutput";
import { messageOf } from "./utils/messageOf";
import { parseCliArguments } from "./utils/parseCliArguments";

const parsed = parseCliArguments(process.argv.slice(2));

if (parsed.ok) {
	const detection = detectAgentOutput({ agents: parsed.options.agents, relays: parsed.options.relays });

	process.exitCode = detection.isAgentOutput ? 0 : 1;

	if (parsed.options.json) {
		try {
			process.stdout.write(`${JSON.stringify(detection)}\n`);
		} catch (error: unknown) {
			process.stderr.write(`${messageOf(error)}\n`);
			process.exitCode = 2;
		}
	}
} else {
	process.stderr.write(`${parsed.usage}\n`);
	process.exitCode = 2;
}
