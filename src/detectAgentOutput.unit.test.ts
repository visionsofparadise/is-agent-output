import { expect, it } from "vitest";
import { detectAgentOutput } from "./detectAgentOutput";
import type { ProcessInfo, Provider, StdoutSink } from "./utils/Provider";

const bashPid = 1001;
const claudePid = 2001;
const codexPid = 2002;
const powershellPid = 1002;
const intermediaryPid = 3001;
const extraPid = 4001;

const processOf = (pid: number, ppid: number | undefined, name: string, commandLine?: string): ProcessInfo => ({
	pid,
	ppid,
	name,
	commandLine,
});

const fakeProviderOf = (args: {
	readonly tree: readonly ProcessInfo[];
	readonly sink: StdoutSink;
	readonly fd1?: Readonly<Record<number, string | undefined>>;
	readonly throws?: string;
}): Provider => {
	const byPid = new Map(args.tree.map((info) => [info.pid, info]));

	return {
		processInfoOf: (pid: number): ProcessInfo | undefined => {
			if (args.throws !== undefined) {
				throw new Error(args.throws);
			}

			return byPid.get(pid);
		},
		stdoutSinkOf: (): StdoutSink => {
			if (args.throws !== undefined) {
				throw new Error(args.throws);
			}

			return args.sink;
		},
		fd1IdentityOf: (pid: number): string | undefined => args.fd1?.[pid],
	};
};

const selfOn = (parentPid: number, commandLine = "node test"): ProcessInfo =>
	processOf(process.pid, parentPid, "node", commandLine);

it("returns false when stdout is a tty", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(claudePid), processOf(claudePid, 1, "claude", "claude.exe")],
			sink: { kind: "tty" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("stdout is a tty");
});

it("returns true for a harness capture pipe owned by claude.exe", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "pipe", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false for an authored pipe owned by a walked bash", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node | cat"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "pipe", serverPid: bashPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored or unresolvable pipe");
});

it("returns true for a file sink not named in the top shell command line", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "file", path: "C:\\Users\\mttcv\\capture.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false for a file sink named in the top shell command line", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node > out.txt"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "file", path: "C:\\tmp\\out.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored redirect");
});

it("returns false when the consumer is an intermediary node script", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(intermediaryPid),
				processOf(intermediaryPid, claudePid, "node", "node intermediary.mjs"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "pipe", serverPid: intermediaryPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.consumer?.name).toBe("node");
	expect(detection.reason).toBe("consumer node matched no agent pattern");
});

it("returns true when the consumer is node hosting claude-code", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, extraPid, "bash", "bash -c node"),
				processOf(extraPid, 1, "node", "node C:\\npm\\claude-code\\cli.js"),
			],
			sink: { kind: "pipe", serverPid: extraPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude-code-node");
});

it("matches a user-supplied agent pattern", () => {
	const detection = detectAgentOutput({
		agents: [{ label: "custom-harness", name: /custom-harness/ }],
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, extraPid, "bash", "bash -c node"),
				processOf(extraPid, 1, "custom-harness", "custom-harness.exe"),
			],
			sink: { kind: "pipe", serverPid: extraPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("custom-harness");
});

it("returns false with a reason when the ancestry walk cycles", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [processOf(process.pid, process.pid, "node", "node test")],
			sink: { kind: "pipe", serverPid: 1, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("process ancestry walk cycle");
});

it("returns false with the error message when the provider throws", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(claudePid)],
			sink: { kind: "pipe", serverPid: claudePid, identity: undefined },
			throws: "peb read failed",
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("peb read failed");
});

it("skips powershell and matches codex", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(powershellPid),
				processOf(powershellPid, codexPid, "powershell", "powershell.exe -Command ..."),
				processOf(codexPid, 1, "codex", "codex.exe"),
			],
			sink: { kind: "pipe", serverPid: codexPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("codex");
});

it("returns true when a linux pipe identity matches the top shell fd 1", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "pipe", serverPid: undefined, identity: "pipe:[123]" },
			fd1: { [bashPid]: "pipe:[123]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false when a linux pipe identity does not match the top shell fd 1", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node | cat"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "pipe", serverPid: undefined, identity: "pipe:[123]" },
			fd1: { [bashPid]: "pipe:[999]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored or unresolvable pipe");
});

it("returns false when a linux pipe identity cannot be compared", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "pipe", serverPid: undefined, identity: "pipe:[123]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored or unresolvable pipe");
});

it("returns true for a direct spawn whose pipe is owned by the parent consumer", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(claudePid), processOf(claudePid, 1, "claude", "claude.exe")],
			sink: { kind: "pipe", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false when the ancestry walk exceeds its bound", () => {
	const chain: Array<ProcessInfo> = [selfOn(9000)];
	let parent = 9000;

	for (let hop = 0; hop < 32; hop += 1) {
		const next = parent + 1;

		chain.push(processOf(parent, next, "bash", "bash"));
		parent = next;
	}

	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: chain,
			sink: { kind: "pipe", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("process ancestry walk bound exceeded");
});

it("returns false for an unknown sink when the current process resolves", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(claudePid), processOf(claudePid, 1, "claude", "claude.exe")],
			sink: { kind: "unknown" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("unknown stdout sink");
});

it("returns false with unsupported platform when the provider cannot resolve self", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [],
			sink: { kind: "unknown" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("unsupported platform");
});

it("returns false when a file sink's top shell command line is unreadable", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "file", path: "C:\\tmp\\out.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("unresolvable top-shell command line");
});

it("keeps builtin labels when a user pattern also matches the consumer", () => {
	const detection = detectAgentOutput({
		agents: [{ label: "my-claude", name: /claude/ }],
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "pipe", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});
