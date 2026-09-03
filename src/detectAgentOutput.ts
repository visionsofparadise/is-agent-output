import { basename } from "node:path";
import { builtinAgentPatterns, type AgentPattern } from "./utils/builtinAgentPatterns";
import { providerOf } from "./utils/providerOf";
import { shellNames } from "./utils/shellNames";
import type { ProcessInfo, Provider, StdoutSink } from "./utils/Provider";

export type { AgentPattern };
export { builtinAgentPatterns };

export interface Detection {
	readonly isAgentOutput: boolean;
	readonly consumer?: { readonly pid: number; readonly name: string; readonly label?: string };
	readonly reason: string;
}

export interface DetectAgentOutputOptions {
	readonly agents?: ReadonlyArray<AgentPattern>;
	readonly provider?: Provider;
}

const WALK_BOUND = 32;

const messageOf = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
};

const matchesRegex = (pattern: RegExp, value: string): boolean => {
	const flags = pattern.flags.replaceAll("g", "");
	const copy = flags.length > 0 ? new RegExp(pattern.source, flags) : new RegExp(pattern.source);

	return copy.test(value);
};

const isShell = (name: string): boolean => shellNames.has(name);

const basenameOf = (path: string): string => basename(path.replaceAll("\\", "/"));

interface Ancestry {
	readonly consumer: ProcessInfo | undefined;
	readonly topShell: ProcessInfo | undefined;
	readonly shells: ReadonlyArray<ProcessInfo>;
	readonly failure: string | undefined;
}

const ancestryOf = (provider: Provider, startPid: number): Ancestry => {
	const seen = new Set<number>();
	const walked: Array<ProcessInfo> = [];
	let pid: number | undefined = startPid;

	for (let hop = 0; hop < WALK_BOUND; hop += 1) {
		if (pid === undefined) {
			break;
		}

		if (seen.has(pid)) {
			return { consumer: undefined, topShell: undefined, shells: [], failure: "process ancestry walk cycle" };
		}

		seen.add(pid);

		const info = provider.processInfoOf(pid);

		if (info === undefined) {
			break;
		}

		walked.push(info);
		pid = info.ppid;
	}

	if (pid !== undefined && !seen.has(pid) && walked.length === WALK_BOUND) {
		return {
			consumer: undefined,
			topShell: undefined,
			shells: [],
			failure: "process ancestry walk bound exceeded",
		};
	}

	const shells: Array<ProcessInfo> = [];
	let consumer: ProcessInfo | undefined;

	for (const ancestor of walked.slice(1)) {
		if (isShell(ancestor.name)) {
			shells.push(ancestor);

			continue;
		}

		consumer = ancestor;

		break;
	}

	if (consumer === undefined) {
		return { consumer: undefined, topShell: undefined, shells, failure: "no consumer resolvable" };
	}

	return { consumer, topShell: shells.at(-1), shells, failure: undefined };
};

const agentLabelOf = (consumer: ProcessInfo, agents: ReadonlyArray<AgentPattern>): string | undefined => {
	for (const pattern of agents) {
		if (!matchesRegex(pattern.name, consumer.name)) {
			continue;
		}

		if (pattern.commandLine !== undefined) {
			if (consumer.commandLine === undefined || !matchesRegex(pattern.commandLine, consumer.commandLine)) {
				continue;
			}
		}

		return pattern.label;
	}

	return undefined;
};

const sinkIsUnmediated = (
	sink: StdoutSink,
	ancestry: Ancestry,
	provider: Provider,
): { readonly unmediated: boolean; readonly reason: string } => {
	const { consumer, topShell, shells } = ancestry;

	if (consumer === undefined) {
		return { unmediated: false, reason: ancestry.failure ?? "no consumer resolvable" };
	}

	if (sink.kind === "pipe") {
		if (sink.identity !== undefined) {
			const comparePid = topShell?.pid ?? consumer.pid;
			const inherited = provider.fd1IdentityOf(comparePid);

			if (inherited === undefined) {
				return { unmediated: false, reason: "authored or unresolvable pipe" };
			}

			if (inherited === sink.identity) {
				return { unmediated: true, reason: "" };
			}

			return { unmediated: false, reason: "authored or unresolvable pipe" };
		}

		if (sink.serverPid === undefined) {
			return { unmediated: false, reason: "authored or unresolvable pipe" };
		}

		if (sink.serverPid === consumer.pid) {
			return { unmediated: true, reason: "" };
		}

		if (shells.some((shell) => shell.pid === sink.serverPid)) {
			return { unmediated: false, reason: "authored or unresolvable pipe" };
		}

		return { unmediated: false, reason: "authored or unresolvable pipe" };
	}

	if (sink.kind === "file") {
		if (topShell === undefined) {
			return { unmediated: true, reason: "" };
		}

		if (topShell.commandLine === undefined) {
			return { unmediated: false, reason: "unresolvable top-shell command line" };
		}

		if (topShell.commandLine.includes(basenameOf(sink.path))) {
			return { unmediated: false, reason: "authored redirect" };
		}

		return { unmediated: true, reason: "" };
	}

	return { unmediated: false, reason: "unknown stdout sink" };
};

const detectWith = (provider: Provider, agents: ReadonlyArray<AgentPattern>): Detection => {
	const sink = provider.stdoutSinkOf();

	if (sink.kind === "tty") {
		return { isAgentOutput: false, reason: "stdout is a tty" };
	}

	const self = provider.processInfoOf(process.pid);

	if (self === undefined && sink.kind === "unknown") {
		return { isAgentOutput: false, reason: "unsupported platform" };
	}

	if (sink.kind === "unknown") {
		return { isAgentOutput: false, reason: "unknown stdout sink" };
	}

	const ancestry = ancestryOf(provider, process.pid);

	if (ancestry.consumer === undefined) {
		return { isAgentOutput: false, reason: ancestry.failure ?? "no consumer resolvable" };
	}

	const mediation = sinkIsUnmediated(sink, ancestry, provider);

	if (!mediation.unmediated) {
		return {
			isAgentOutput: false,
			consumer: { pid: ancestry.consumer.pid, name: ancestry.consumer.name },
			reason: mediation.reason,
		};
	}

	const label = agentLabelOf(ancestry.consumer, agents);

	if (label === undefined) {
		return {
			isAgentOutput: false,
			consumer: { pid: ancestry.consumer.pid, name: ancestry.consumer.name },
			reason: `consumer ${ancestry.consumer.name} matched no agent pattern`,
		};
	}

	return {
		isAgentOutput: true,
		consumer: { pid: ancestry.consumer.pid, name: ancestry.consumer.name, label },
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
