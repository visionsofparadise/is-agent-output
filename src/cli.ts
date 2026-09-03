#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectAgentOutput } from "./detectAgentOutput";
import type { AgentPattern } from "./utils/builtinAgentPatterns";

export const usage = "Usage: is-agent-output [--json] [--agent <label>:<nameRegex>[:<commandLineRegex>]]...";

export interface ParsedCliOptions {
	readonly json: boolean;
	readonly agents: ReadonlyArray<AgentPattern>;
}

export type CliParseResult =
	{ readonly ok: true; readonly options: ParsedCliOptions } | { readonly ok: false; readonly usage: string };

const messageOf = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
};

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

export const parseCliArguments = (argv: ReadonlyArray<string>): CliParseResult => {
	let json = false;
	const agents: Array<AgentPattern> = [];

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

		return { ok: false, usage: `${usage}\nunknown flag: ${argument ?? ""}` };
	}

	return { ok: true, options: { json, agents } };
};

const runCli = (argv: ReadonlyArray<string>): void => {
	const parsed = parseCliArguments(argv);

	if (!parsed.ok) {
		process.stderr.write(`${parsed.usage}\n`);
		process.exitCode = 2;

		return;
	}

	const detection = detectAgentOutput({ agents: parsed.options.agents });

	process.exitCode = detection.isAgentOutput ? 0 : 1;

	if (!parsed.options.json) {
		return;
	}

	try {
		process.stdout.write(`${JSON.stringify(detection)}\n`);
	} catch (error: unknown) {
		process.stderr.write(`${messageOf(error)}\n`);
		process.exitCode = 2;
	}
};

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);

if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
	runCli(process.argv.slice(2));
}
