import { messageOf } from "./messageOf";
import type { AgentPattern } from "./builtinAgentPatterns";
import type { RelayPattern } from "./builtinRelayPatterns";

export const usage =
	"Usage: is-agent-output [--json] [--agent <label>:<nameRegex>[:<commandLineRegex>]]... [--relay <nameRegex>[:<commandLineRegex>]]...";

interface ParsedCliOptions {
	readonly json: boolean;
	readonly agents: ReadonlyArray<AgentPattern>;
	readonly relays: ReadonlyArray<RelayPattern>;
}

export type CliParseResult =
	{ readonly ok: true; readonly options: ParsedCliOptions } | { readonly ok: false; readonly usage: string };

const regexOf = (source: string, field: string): RegExp | string => {
	if (source.length === 0) {
		return `${field} regex is empty`;
	}

	try {
		return new RegExp(source);
	} catch (error: unknown) {
		return `${field} regex is invalid: ${messageOf(error)}`;
	}
};

const agentPatternOf = (value: string): AgentPattern | string => {
	const firstColon = value.indexOf(":");

	if (firstColon < 0) {
		return "agent value must be <label>:<nameRegex>[:<commandLineRegex>]";
	}

	const label = value.slice(0, firstColon);
	const rest = value.slice(firstColon + 1);

	if (label.length === 0) {
		return "agent label is empty";
	}

	const secondColon = rest.indexOf(":");
	const nameSource = secondColon < 0 ? rest : rest.slice(0, secondColon);
	const commandLineSource = secondColon < 0 ? undefined : rest.slice(secondColon + 1);
	const name = regexOf(nameSource, "name");

	if (typeof name === "string") {
		return name;
	}

	if (commandLineSource === undefined) {
		return { label, name };
	}

	const commandLine = regexOf(commandLineSource, "commandLine");

	if (typeof commandLine === "string") {
		return commandLine;
	}

	return { label, name, commandLine };
};

const relayPatternOf = (value: string): RelayPattern | string => {
	const firstColon = value.indexOf(":");
	const nameSource = firstColon < 0 ? value : value.slice(0, firstColon);
	const commandLineSource = firstColon < 0 ? undefined : value.slice(firstColon + 1);
	const name = regexOf(nameSource, "name");

	if (typeof name === "string") {
		return name;
	}

	if (commandLineSource === undefined) {
		return { name };
	}

	const commandLine = regexOf(commandLineSource, "commandLine");

	if (typeof commandLine === "string") {
		return commandLine;
	}

	return { name, commandLine };
};

export const parseCliArguments = (argv: ReadonlyArray<string>): CliParseResult => {
	let json = false;
	const agents: Array<AgentPattern> = [];
	const relays: Array<RelayPattern> = [];

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--json") {
			json = true;

			continue;
		}

		if (argument === "--agent") {
			const value = argv[index + 1];

			if (value === undefined || value.startsWith("--")) {
				return { ok: false, usage: `${usage}\n--agent requires a value` };
			}

			const pattern = agentPatternOf(value);

			if (typeof pattern === "string") {
				return { ok: false, usage: `${usage}\n${pattern}` };
			}

			agents.push(pattern);
			index += 1;

			continue;
		}

		if (argument === "--relay") {
			const value = argv[index + 1];

			if (value === undefined || value.length === 0 || value.startsWith("--")) {
				return { ok: false, usage: `${usage}\n--relay requires a value` };
			}

			const pattern = relayPatternOf(value);

			if (typeof pattern === "string") {
				return { ok: false, usage: `${usage}\n${pattern}` };
			}

			relays.push(pattern);
			index += 1;

			continue;
		}

		return { ok: false, usage: `${usage}\nunknown flag: ${argument ?? ""}` };
	}

	return { ok: true, options: { json, agents, relays } };
};
