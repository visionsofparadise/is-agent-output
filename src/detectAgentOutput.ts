import { basename } from "node:path";
import { builtinAgentPatterns, type AgentPattern } from "./utils/builtinAgentPatterns";
import { builtinRelayPatterns, type RelayPattern } from "./utils/builtinRelayPatterns";
import { messageOf } from "./utils/messageOf";
import { providerOf } from "./utils/providerOf";
import type { ProcessInfo, Provider, StdoutSink } from "./utils/Provider";

export interface Detection {
	readonly isAgentOutput: boolean;
	readonly consumer?: { readonly pid: number; readonly name: string; readonly label?: string };
	readonly reason: string;
}

export interface DetectAgentOutputOptions {
	readonly agents?: ReadonlyArray<AgentPattern>;
	readonly relays?: ReadonlyArray<RelayPattern>;
	readonly provider?: Provider;
}

type MediatableSink = Extract<StdoutSink, { readonly kind: "stream" | "file" }>;

type CommandLineOf = (pid: number) => string | undefined;

const WALK_BOUND = 32;

const matchesRegex = (pattern: RegExp, value: string): boolean => {
	if (!pattern.global && !pattern.sticky) {
		return pattern.test(value);
	}

	return new RegExp(pattern.source, pattern.flags.replaceAll("g", "").replaceAll("y", "")).test(value);
};

const memoizedCommandLineOf = (provider: Provider): CommandLineOf => {
	const read = new Map<number, string | undefined>();

	return (pid: number): string | undefined => {
		if (read.has(pid)) {
			return read.get(pid);
		}

		const commandLine = provider.commandLineOf(pid);

		read.set(pid, commandLine);

		return commandLine;
	};
};

const relayMatches = (
	info: ProcessInfo,
	relays: ReadonlyArray<RelayPattern>,
	commandLineOf: CommandLineOf,
): RelayPattern | undefined => {
	for (const pattern of relays) {
		if (!matchesRegex(pattern.name, info.name)) {
			continue;
		}

		if (pattern.commandLine !== undefined) {
			const commandLine = commandLineOf(info.pid);

			if (commandLine === undefined || !matchesRegex(pattern.commandLine, commandLine)) {
				continue;
			}
		}

		return pattern;
	}

	return undefined;
};

const basenameOf = (path: string): string => basename(path.replaceAll("\\", "/"));

interface RelayFrame {
	readonly info: ProcessInfo;
	readonly attests: boolean;
}

interface ResolvedAncestry {
	readonly consumer: ProcessInfo;
	readonly topRelay: ProcessInfo | undefined;
	readonly relays: ReadonlyArray<RelayFrame>;
}

type Ancestry = ResolvedAncestry | { readonly failure: string };

const ancestryOf = (
	provider: Provider,
	startPid: number,
	relays: ReadonlyArray<RelayPattern>,
	commandLineOf: CommandLineOf,
): Ancestry => {
	const seen = new Set<number>([startPid]);
	const frames: Array<RelayFrame> = [];
	let pid = provider.processInfoOf(startPid)?.ppid;

	for (let hop = 0; hop < WALK_BOUND; hop += 1) {
		if (pid === undefined) {
			return { failure: `ancestry ends at ${frames.at(-1)?.info.name ?? "self"} with no consumer` };
		}

		if (seen.has(pid)) {
			return { failure: "process ancestry walk cycle" };
		}

		seen.add(pid);

		const info = provider.processInfoOf(pid);

		if (info === undefined) {
			return { failure: `ancestor ${pid} unresolvable` };
		}

		const relay = relayMatches(info, relays, commandLineOf);

		if (relay === undefined) {
			return { consumer: info, topRelay: frames.at(-1)?.info, relays: frames };
		}

		frames.push({ info, attests: relay.attests ?? true });
		pid = info.ppid;
	}

	return { failure: "process ancestry walk bound exceeded" };
};

const agentLabelOf = (
	consumer: ProcessInfo,
	agents: ReadonlyArray<AgentPattern>,
	commandLineOf: () => string | undefined,
): string | undefined => {
	let commandLine: string | undefined;
	let commandLineRead = false;

	for (const pattern of agents) {
		if (!matchesRegex(pattern.name, consumer.name)) {
			continue;
		}

		if (pattern.commandLine !== undefined) {
			if (!commandLineRead) {
				commandLine = commandLineOf();
				commandLineRead = true;
			}

			if (commandLine === undefined || !matchesRegex(pattern.commandLine, commandLine)) {
				continue;
			}
		}

		return pattern.label;
	}

	return undefined;
};

const sinkIsUnmediated = (
	sink: MediatableSink,
	consumer: ProcessInfo,
	ancestry: ResolvedAncestry,
	provider: Provider,
	commandLineOf: CommandLineOf,
): { readonly unmediated: boolean; readonly reason: string } => {
	const { topRelay, relays } = ancestry;

	if (sink.kind === "stream") {
		if (sink.identity !== undefined) {
			if (topRelay === undefined) {
				return { unmediated: true, reason: "" };
			}

			const inherited = provider.fd1IdentityOf(topRelay.pid);

			if (inherited === undefined) {
				return { unmediated: false, reason: "stream owner unresolved" };
			}

			if (inherited === sink.identity) {
				return { unmediated: true, reason: "" };
			}

			return { unmediated: false, reason: "authored stream" };
		}

		if (sink.serverPid === undefined) {
			return { unmediated: false, reason: "stream owner unresolved" };
		}

		if (sink.serverPid === consumer.pid) {
			return { unmediated: true, reason: "" };
		}

		if (relays.some((relay) => relay.info.pid === sink.serverPid)) {
			return { unmediated: false, reason: "authored stream owned by relay" };
		}

		return { unmediated: false, reason: "authored stream" };
	}

	const outermost = relays.at(-1);

	if (outermost === undefined) {
		return { unmediated: false, reason: "file sink with no surviving relay" };
	}

	if (!outermost.attests) {
		return { unmediated: false, reason: "file sink attested by a runner" };
	}

	if (provider.fd1IdentityOf(process.pid) !== undefined) {
		const inherited = provider.fd1IdentityOf(outermost.info.pid);

		if (inherited === undefined) {
			return { unmediated: false, reason: "unreadable relay fd 1" };
		}

		if (inherited === sink.path) {
			return { unmediated: true, reason: "" };
		}

		return { unmediated: false, reason: "authored redirect" };
	}

	const commandLines = relays.map((relay) => commandLineOf(relay.info.pid));

	if (commandLines.some((commandLine) => commandLine === undefined)) {
		return { unmediated: false, reason: "unresolvable relay command line" };
	}

	const sinkBasename = basenameOf(sink.path);

	if (commandLines.some((commandLine) => commandLine?.includes(sinkBasename) === true)) {
		return { unmediated: false, reason: "authored redirect" };
	}

	return { unmediated: true, reason: "" };
};

const detectWith = (
	provider: Provider,
	agents: ReadonlyArray<AgentPattern>,
	relays: ReadonlyArray<RelayPattern>,
): Detection => {
	const sink = provider.stdoutSinkOf();

	if (sink.kind === "tty") {
		return { isAgentOutput: false, reason: "stdout is a tty" };
	}

	if (sink.kind === "unknown") {
		const supported = provider.processInfoOf(process.pid) !== undefined;

		return { isAgentOutput: false, reason: supported ? "unknown stdout sink" : "unsupported platform" };
	}

	const commandLineOf = memoizedCommandLineOf(provider);
	const ancestry = ancestryOf(provider, process.pid, relays, commandLineOf);

	if ("failure" in ancestry) {
		return { isAgentOutput: false, reason: ancestry.failure };
	}

	const consumer = ancestry.consumer;
	const label = agentLabelOf(consumer, agents, () => commandLineOf(consumer.pid));

	if (label === undefined) {
		return {
			isAgentOutput: false,
			consumer: { pid: consumer.pid, name: consumer.name },
			reason: `consumer ${consumer.name} matched no agent pattern`,
		};
	}

	const mediation = sinkIsUnmediated(sink, consumer, ancestry, provider, commandLineOf);

	if (!mediation.unmediated) {
		return {
			isAgentOutput: false,
			consumer: { pid: consumer.pid, name: consumer.name, label },
			reason: mediation.reason,
		};
	}

	return {
		isAgentOutput: true,
		consumer: { pid: consumer.pid, name: consumer.name, label },
		reason: `unmediated output to ${label}`,
	};
};

export const detectAgentOutput = (options?: DetectAgentOutputOptions): Detection => {
	try {
		const provider = options?.provider ?? providerOf();
		const agents = [...builtinAgentPatterns, ...(options?.agents ?? [])];
		const relays = [...builtinRelayPatterns, ...(options?.relays ?? [])];

		return detectWith(provider, agents, relays);
	} catch (error: unknown) {
		return { isAgentOutput: false, reason: messageOf(error) };
	}
};
