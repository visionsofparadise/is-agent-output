import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { detectAgentOutput } from "./detectAgentOutput";
import type { ProcessInfo, Provider, StdoutSink } from "./utils/Provider";

const bashPid = 1001;
const claudePid = 2001;
const codexPid = 2002;
const powershellPid = 1002;
const intermediaryPid = 3001;
const extraPid = 4001;

interface FakeProcess {
	readonly info: ProcessInfo;
	readonly commandLine: string | undefined;
}

const processOf = (pid: number, ppid: number | undefined, name: string, commandLine?: string): FakeProcess => ({
	info: { pid, ppid, name },
	commandLine,
});

const commandLineReads = vi.fn<(pid: number) => void>();

beforeEach(() => {
	commandLineReads.mockClear();
});

afterEach(() => {
	const pids = commandLineReads.mock.calls.map(([pid]) => pid);

	expect(new Set(pids).size).toBe(pids.length);
});

const fakeProviderOf = (args: {
	readonly tree: readonly FakeProcess[];
	readonly sink: StdoutSink;
	readonly fd1?: Readonly<Record<number, string | undefined>>;
	readonly throws?: string;
}): Provider => {
	const byPid = new Map(args.tree.map((process) => [process.info.pid, process]));

	return {
		processInfoOf: (pid: number): ProcessInfo | undefined => {
			if (args.throws !== undefined) {
				throw new Error(args.throws);
			}

			return byPid.get(pid)?.info;
		},
		commandLineOf: (pid: number): string | undefined => {
			commandLineReads(pid);

			return byPid.get(pid)?.commandLine;
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

const selfOn = (parentPid: number, commandLine = "node test"): FakeProcess =>
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

it("returns true for a harness capture stream owned by claude.exe", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false for an authored stream owned by a walked bash", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node | cat"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: bashPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.consumer?.label).toBe("claude");
	expect(detection.reason).toBe("authored stream owned by relay");
});

it("returns false for a stream owned by neither the consumer nor a relay", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: extraPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored stream");
});

it("returns true for a file sink not named in the top relay command line", () => {
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

it("returns false for a file sink named in the top relay command line", () => {
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
			sink: { kind: "stream", serverPid: intermediaryPid, identity: undefined },
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
			sink: { kind: "stream", serverPid: extraPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude-code-node");
});

it("rejects a consumer whose name merely contains a builtin name", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, extraPid, "bash", "bash -c node"),
				processOf(extraPid, 1, "claude-monitor", "claude-monitor.exe"),
			],
			sink: { kind: "stream", serverPid: extraPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("consumer claude-monitor matched no agent pattern");
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
			sink: { kind: "stream", serverPid: extraPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("custom-harness");
});

it("returns false with a reason when the ancestry walk cycles", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [processOf(process.pid, process.pid, "node", "node test")],
			sink: { kind: "stream", serverPid: 1, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("process ancestry walk cycle");
});

it("resolves the consumer despite a cycle above it", () => {
	const grandparentPid = 5001;
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, grandparentPid, "claude", "claude.exe"),
				processOf(grandparentPid, claudePid, "explorer", "explorer.exe"),
			],
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false with the error message when the provider throws", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(claudePid)],
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
			throws: "peb read failed",
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("peb read failed");
});

it("skips env from a shebang launcher and matches grok", () => {
	const envPid = 1003;
	const grokPid = 2003;
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(envPid),
				processOf(envPid, grokPid, "env", "/usr/bin/env node"),
				processOf(grokPid, 1, "grok", "grok.exe"),
			],
			sink: { kind: "stream", serverPid: grokPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("grok");
});

it("skips powershell and matches codex", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(powershellPid),
				processOf(powershellPid, codexPid, "powershell", "powershell.exe -Command ..."),
				processOf(codexPid, 1, "codex", "codex.exe"),
			],
			sink: { kind: "stream", serverPid: codexPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("codex");
});

it("returns true when a linux pipe identity matches the top relay fd 1", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: undefined, identity: "pipe:[123]" },
			fd1: { [bashPid]: "pipe:[123]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false when a linux pipe identity does not match the top relay fd 1", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node | cat"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: undefined, identity: "pipe:[123]" },
			fd1: { [bashPid]: "pipe:[999]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored stream");
});

it("returns false when a linux pipe identity cannot be compared", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: undefined, identity: "pipe:[123]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("stream owner unresolved");
});

it("returns false for a file sink when no relay survived to attribute it to", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(claudePid), processOf(claudePid, 1, "claude", "claude.exe")],
			sink: { kind: "file", path: "/tmp/out.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("file sink with no surviving relay");
});

it("returns true for a direct spawn with no surviving relay to compare against", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(claudePid), processOf(claudePid, 1, "claude", "claude.exe")],
			sink: { kind: "stream", serverPid: undefined, identity: "socket:[123]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns true when a linux socket identity matches the top relay fd 1", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: undefined, identity: "socket:[123]" },
			fd1: { [bashPid]: "socket:[123]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns true for a direct spawn whose stream is owned by the parent consumer", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(claudePid), processOf(claudePid, 1, "claude", "claude.exe")],
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false when the ancestry walk exceeds its bound", () => {
	const chain: Array<FakeProcess> = [selfOn(9000)];
	let parent = 9000;

	for (let hop = 0; hop < 40; hop += 1) {
		const next = parent + 1;

		chain.push(processOf(parent, next, "bash", "bash"));
		parent = next;
	}

	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: chain,
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
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

it("returns false when a file sink's relay command line is unreadable", () => {
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
	expect(detection.reason).toBe("unresolvable relay command line");
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
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("reads no command line when the walk and the matching pattern do not need one", () => {
	const provider = fakeProviderOf({
		tree: [
			selfOn(bashPid),
			processOf(bashPid, claudePid, "bash", "bash -c node"),
			processOf(claudePid, 1, "claude", "claude.exe"),
		],
		sink: { kind: "stream", serverPid: claudePid, identity: undefined },
	});
	const commandLineOf = vi.fn(provider.commandLineOf);
	const detection = detectAgentOutput({ provider: { ...provider, commandLineOf } });

	expect(detection.isAgentOutput).toBe(true);
	expect(commandLineOf).not.toHaveBeenCalled();
});

it("reads the consumer command line once for a pattern that discriminates on it", () => {
	const provider = fakeProviderOf({
		tree: [
			selfOn(bashPid),
			processOf(bashPid, extraPid, "bash", "bash -c node"),
			processOf(extraPid, 1, "node", "node C:\\npm\\claude-code\\cli.js"),
		],
		sink: { kind: "stream", serverPid: extraPid, identity: undefined },
	});
	const commandLineOf = vi.fn(provider.commandLineOf);
	const detection = detectAgentOutput({ provider: { ...provider, commandLineOf } });

	expect(detection.consumer?.label).toBe("claude-code-node");
	expect(commandLineOf).toHaveBeenCalledExactlyOnceWith(extraPid);
});

const npmNodePid = 6001;
const npmShimPid = 6002;
const cmdPid = 6003;
const npmTitlePid = 6004;
const pnpmNodePid = 6005;
const scriptPid = 6006;
const shPid = 6007;
const windowsNpmNodeCommandLine =
	'"C:\\Program Files\\nodejs\\node.exe" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run --silent probe';
const windowsNpmShimCommandLine = "C:\\Users\\mttcv\\AppData\\Local\\znpm\\shim\\npm.exe run --silent probe";
const windowsNpmBuildNodeCommandLine =
	'"C:\\Program Files\\nodejs\\node.exe" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run build';
const windowsNpmBuildShimCommandLine = "C:\\Users\\mttcv\\AppData\\Local\\znpm\\shim\\npm.exe run build";
const windowsRedirectingCmdCommandLine = 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c "node cli.js > out.txt"';

it("returns true for a windows npm run chain whose stream is owned by claude", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(cmdPid),
				processOf(cmdPid, npmNodePid, "cmd", 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c "node cli.js"'),
				processOf(npmNodePid, npmShimPid, "node", windowsNpmNodeCommandLine),
				processOf(npmShimPid, bashPid, "npm", windowsNpmShimCommandLine),
				processOf(bashPid, claudePid, "bash", 'bash -c "npm run --silent probe"'),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false when a windows npm run chain's stream is owned by npm's node", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(cmdPid),
				processOf(cmdPid, npmNodePid, "cmd", 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c "node cli.js"'),
				processOf(npmNodePid, npmShimPid, "node", windowsNpmNodeCommandLine),
				processOf(npmShimPid, bashPid, "npm", windowsNpmShimCommandLine),
				processOf(bashPid, claudePid, "bash", 'bash -c "npm run --silent probe"'),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: npmNodePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored stream owned by relay");
});

it("returns true for a linux npm run title under a shell relay", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(npmTitlePid),
				processOf(npmTitlePid, bashPid, "npm run probe", "npm run probe"),
				processOf(bashPid, claudePid, "bash", "bash -c npm run probe"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "stream", serverPid: undefined, identity: "pipe:[555]" },
			fd1: { [process.pid]: "pipe:[555]", [bashPid]: "pipe:[555]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns true for a linux pnpm node spawned directly by the harness", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(pnpmNodePid),
				processOf(pnpmNodePid, claudePid, "node", "node /usr/lib/node_modules/pnpm/bin/pnpm.cjs run probe"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "stream", serverPid: undefined, identity: "pipe:[666]" },
			fd1: { [process.pid]: "pipe:[666]", [pnpmNodePid]: "pipe:[666]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false for a node consumer running a script rather than a package runner", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(scriptPid),
				processOf(scriptPid, claudePid, "node", "node /home/u/some-script.js"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "stream", serverPid: scriptPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("consumer node matched no agent pattern");
});

it("skips a user-supplied relay pattern", () => {
	const detection = detectAgentOutput({
		relays: [{ name: /^myrelay$/ }],
		provider: fakeProviderOf({
			tree: [
				selfOn(extraPid),
				processOf(extraPid, claudePid, "myrelay", "myrelay --wrap node"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false for a file sink whose outermost relay is a package runner", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(npmTitlePid),
				processOf(npmTitlePid, claudePid, "npm run build", "npm run build"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "file", path: "/tmp/capture.txt" },
			fd1: { [process.pid]: "pipe:[1]", [npmTitlePid]: "/tmp/capture.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("file sink attested by a runner");
});

it("returns true for a file sink matching the attesting shell relay fd 1", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(shPid),
				processOf(shPid, npmTitlePid, "sh", "sh -c node cli.js"),
				processOf(npmTitlePid, bashPid, "npm run build", "npm run build"),
				processOf(bashPid, claudePid, "bash", "bash -c npm run build"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "file", path: "/tmp/capture.txt" },
			fd1: { [process.pid]: "pipe:[1]", [bashPid]: "/tmp/capture.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false for a file sink differing from the attesting shell relay fd 1", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(shPid),
				processOf(shPid, npmTitlePid, "sh", "sh -c node cli.js"),
				processOf(npmTitlePid, bashPid, "npm run build", "npm run build"),
				processOf(bashPid, claudePid, "bash", "bash -c npm run build > out.txt"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "file", path: "/tmp/out.txt" },
			fd1: { [process.pid]: "pipe:[1]", [bashPid]: "pipe:[2]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored redirect");
});

it("returns false for a windows file sink named on an inner relay command line", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(cmdPid),
				processOf(cmdPid, npmNodePid, "cmd", windowsRedirectingCmdCommandLine),
				processOf(npmNodePid, npmShimPid, "node", windowsNpmBuildNodeCommandLine),
				processOf(npmShimPid, bashPid, "npm", windowsNpmBuildShimCommandLine),
				processOf(bashPid, claudePid, "bash", 'bash -c "npm run build"'),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "file", path: "C:\\Users\\mttcv\\project\\out.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored redirect");
});

it("returns true for a windows file sink named on no relay command line", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(cmdPid),
				processOf(cmdPid, npmNodePid, "cmd", windowsRedirectingCmdCommandLine),
				processOf(npmNodePid, npmShimPid, "node", windowsNpmBuildNodeCommandLine),
				processOf(npmShimPid, bashPid, "npm", windowsNpmBuildShimCommandLine),
				processOf(bashPid, claudePid, "bash", 'bash -c "npm run build"'),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "file", path: "C:\\Users\\mttcv\\project\\capture.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false for a dash-family redirect the attesting relay applied to its own fd 1", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(shPid),
				processOf(shPid, claudePid, "sh", "sh -c node cli.js > /tmp/out.txt"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "file", path: "/tmp/out.txt" },
			fd1: { [process.pid]: "pipe:[1]", [shPid]: "/tmp/out.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("authored redirect");
});

it("returns false for a redirect operator whose target a relay command line hides", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(shPid),
				processOf(shPid, claudePid, "sh", 'sh -c node cli.js > "$OUT"'),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "file", path: "/tmp/out.txt" },
			fd1: { [process.pid]: "pipe:[1]", [shPid]: "/tmp/out.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("unresolvable redirect target in a relay command line");
});

it.each([
	["noclobber override", 'sh -c node cli.js >| "$OUT"'],
	["delayed expansion", 'cmd /d /s /c "node cli.js > !OUT!"'],
	["duplicated descriptor", 'sh -c node cli.js >& "$OUT"'],
])("returns false for a %s hiding the redirect target", (_label: string, commandLine: string) => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(shPid),
				processOf(shPid, claudePid, "sh", commandLine),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "file", path: "/tmp/out.txt" },
			fd1: { [process.pid]: "pipe:[1]", [shPid]: "/tmp/out.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("unresolvable redirect target in a relay command line");
});

const claudeSnapshotCommandLine = String.raw`"C:\Program Files\Git\bin\bash.exe" -c "source /c/Users/mttcv/.claude/shell-snapshots/snapshot-bash-1788540327742-ru8mkq.sh 2>/dev/null || true && export TEMP='C:\Users\mttcv\AppData\Local\Temp' && shopt -u extglob 2>/dev/null || true && eval 'cd '"`;

it.each([
	["a cmd batch file", String.raw`cmd /d /s /c redirect.bat`],
	["a powershell script", String.raw`powershell -File .\redirect.ps1`],
	["a posix script", String.raw`sh /tmp/redirect.sh`],
])("returns false for %s whose body the relay command line hides", (_label: string, commandLine: string) => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(shPid),
				processOf(shPid, claudePid, "sh", commandLine),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "file", path: "/tmp/out.txt" },
			fd1: { [process.pid]: "pipe:[1]", [shPid]: "/tmp/out.txt" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("unreadable script in a relay command line");
});

it("returns true for a file sink under a relay that sources a harness snapshot", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", claudeSnapshotCommandLine),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "file", path: String.raw`C:\Users\mttcv\.claude\tasks\4f2a.output` },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("returns false when an attesting relay fd 1 cannot be read", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, claudePid, "bash", "bash -c node cli.js"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "file", path: "/tmp/capture.txt" },
			fd1: { [process.pid]: "pipe:[1]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("unreadable relay fd 1");
});

it("names the ancestry ending when the outermost relay has no parent", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(bashPid), processOf(bashPid, undefined, "bash", "bash -c node cli.js")],
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("ancestry ends at bash with no consumer");
});

it("names the ancestor that could not be resolved", () => {
	const deadPid = 999;
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [selfOn(bashPid), processOf(bashPid, deadPid, "bash", "bash -c node cli.js")],
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe(`ancestor ${deadPid} unresolvable`);
});

it("reports the pattern miss ahead of an authored stream", () => {
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(intermediaryPid),
				processOf(intermediaryPid, claudePid, "node", "node intermediary.mjs"),
				processOf(claudePid, 1, "claude", "claude.exe"),
			],
			sink: { kind: "stream", serverPid: extraPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("consumer node matched no agent pattern");
});

it("matches the codex command runner that owns the windows pipe", () => {
	const runnerPid = 2004;
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(powershellPid),
				processOf(powershellPid, runnerPid, "powershell", "powershell.exe -Command ..."),
				processOf(runnerPid, 1, "codex-command-runner-0.144.6", "codex-command-runner-0.144.6.exe"),
			],
			sink: { kind: "stream", serverPid: runnerPid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("codex-command-runner");
});

it("matches a node consumer carrying a claude code command line", () => {
	const nodePid = 2005;
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, nodePid, "bash", "bash -c node"),
				processOf(nodePid, 1, "node", "node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js"),
			],
			sink: { kind: "stream", serverPid: nodePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude-code-node");
});

it("matches the codex linux sandbox fallback frame", () => {
	const sandboxPid = 2006;
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, sandboxPid, "bash", "bash -c node"),
				processOf(sandboxPid, 1, "codex-linux-san", "codex-linux-sandbox"),
			],
			sink: { kind: "stream", serverPid: undefined, identity: "pipe:[771]" },
			fd1: { [bashPid]: "pipe:[771]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("codex-linux-sandbox-fallback");
});

it("skips bubblewrap and compares the sink with its fd 1", () => {
	const bwrapPid = 1005;
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, bwrapPid, "bash", "bash -c node"),
				processOf(bwrapPid, claudePid, "bwrap", "bwrap --dev-bind / / bash -c node"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "stream", serverPid: undefined, identity: "pipe:[772]" },
			fd1: { [bwrapPid]: "pipe:[772]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("takes the bash adjacent to the consumer as the top relay across timeout", () => {
	const innerBashPid = 1006;
	const timeoutPid = 1007;
	const outerBashPid = 1008;
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(innerBashPid),
				processOf(innerBashPid, timeoutPid, "bash", "bash -c node"),
				processOf(timeoutPid, outerBashPid, "timeout", "timeout 60 bash -c node"),
				processOf(outerBashPid, claudePid, "bash", "bash -c timeout 60 bash -c node"),
				processOf(claudePid, 1, "claude", "claude"),
			],
			sink: { kind: "stream", serverPid: undefined, identity: "pipe:[773]" },
			fd1: { [innerBashPid]: "pipe:[999]", [outerBashPid]: "pipe:[773]" },
		}),
	});

	expect(detection.isAgentOutput).toBe(true);
	expect(detection.consumer?.label).toBe("claude");
});

it("names bubblewrap as the ancestry ending inside a pid namespace", () => {
	const bwrapPid = 1009;
	const detection = detectAgentOutput({
		provider: fakeProviderOf({
			tree: [
				selfOn(bashPid),
				processOf(bashPid, bwrapPid, "bash", "bash -c node"),
				processOf(bwrapPid, undefined, "bwrap", "bwrap --unshare-pid bash -c node"),
			],
			sink: { kind: "stream", serverPid: claudePid, identity: undefined },
		}),
	});

	expect(detection.isAgentOutput).toBe(false);
	expect(detection.reason).toBe("ancestry ends at bwrap with no consumer");
});
