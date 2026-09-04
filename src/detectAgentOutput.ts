import { basename } from "node:path";
import { builtinAgentPatterns, type AgentPattern } from "./utils/builtinAgentPatterns";
import { messageOf } from "./utils/messageOf";
import { providerOf } from "./utils/providerOf";
import { relayNames } from "./utils/relayNames";
import type { ProcessInfo, Provider, StdoutSink } from "./utils/Provider";

export interface Detection {
	readonly isAgentOutput: boolean;
	readonly consumer?: { readonly pid: number; readonly name: string; readonly label?: string };
	readonly reason: string;
}

export interface DetectAgentOutputOptions {
	readonly agents?: ReadonlyArray<AgentPattern>;
	readonly provider?: Provider;
}

type MediatableSink = Extract<StdoutSink, { readonly kind: "stream" | "file" }>;

const WALK_BOUND = 32;

const matchesRegex = (pattern: RegExp, value: string): boolean => {
	if (!pattern.global && !pattern.sticky) {
		return pattern.test(value);
	}

	return new RegExp(pattern.source, pattern.flags.replaceAll("g", "").replaceAll("y", "")).test(value);
};

const isRelay = (name: string): boolean => relayNames.has(name);

const basenameOf = (path: string): string => basename(path.replaceAll("\\", "/"));

interface Ancestry {
	readonly consumer: ProcessInfo | undefined;
	readonly topRelay: ProcessInfo | undefined;
	readonly relays: ReadonlyArray<ProcessInfo>;
	readonly failure: string | undefined;
}

const ancestryOf = (provider: Provider, startPid: number): Ancestry => {
	const seen = new Set<number>([startPid]);
	const relays: Array<ProcessInfo> = [];
	let pid = provider.processInfoOf(startPid)?.ppid;

	for (let hop = 0; hop < WALK_BOUND; hop += 1) {
		if (pid === undefined) {
			return { consumer: undefined, topRelay: undefined, relays, failure: "no consumer resolvable" };
		}

		if (seen.has(pid)) {
			return { consumer: undefined, topRelay: undefined, relays, failure: "process ancestry walk cycle" };
		}

		seen.add(pid);

		const info = provider.processInfoOf(pid);

		if (info === undefined) {
			return { consumer: undefined, topRelay: undefined, relays, failure: "no consumer resolvable" };
		}

		if (!isRelay(info.name)) {
			return { consumer: info, topRelay: relays.at(-1), relays, failure: undefined };
		}

		relays.push(info);
		pid = info.ppid;
	}

	return { consumer: undefined, topRelay: undefined, relays, failure: "process ancestry walk bound exceeded" };
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
	ancestry: Ancestry,
	provider: Provider,
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

		if (relays.some((relay) => relay.pid === sink.serverPid)) {
			return { unmediated: false, reason: "authored stream owned by relay" };
		}

		return { unmediated: false, reason: "authored stream" };
	}

	if (topRelay === undefined) {
		return { unmediated: false, reason: "file sink with no surviving relay" };
	}

	const commandLine = provider.commandLineOf(topRelay.pid);

	if (commandLine === undefined) {
		return { unmediated: false, reason: "unresolvable top-relay command line" };
	}

	if (commandLine.includes(basenameOf(sink.path))) {
		return { unmediated: false, reason: "authored redirect" };
	}

	return { unmediated: true, reason: "" };
};

const detectWith = (provider: Provider, agents: ReadonlyArray<AgentPattern>): Detection => {
	const sink = provider.stdoutSinkOf();

	if (sink.kind === "tty") {
		return { isAgentOutput: false, reason: "stdout is a tty" };
	}

	if (sink.kind === "unknown") {
		const supported = provider.processInfoOf(process.pid) !== undefined;

		return { isAgentOutput: false, reason: supported ? "unknown stdout sink" : "unsupported platform" };
	}

	const ancestry = ancestryOf(provider, process.pid);
	const consumer = ancestry.consumer;

	if (consumer === undefined) {
		return { isAgentOutput: false, reason: ancestry.failure ?? "no consumer resolvable" };
	}

	const mediation = sinkIsUnmediated(sink, consumer, ancestry, provider);

	if (!mediation.unmediated) {
		return {
			isAgentOutput: false,
			consumer: { pid: consumer.pid, name: consumer.name },
			reason: mediation.reason,
		};
	}

	const label = agentLabelOf(consumer, agents, () => provider.commandLineOf(consumer.pid));

	if (label === undefined) {
		return {
			isAgentOutput: false,
			consumer: { pid: consumer.pid, name: consumer.name },
			reason: `consumer ${consumer.name} matched no agent pattern`,
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

		return detectWith(provider, agents);
	} catch (error: unknown) {
		return { isAgentOutput: false, reason: messageOf(error) };
	}
};
