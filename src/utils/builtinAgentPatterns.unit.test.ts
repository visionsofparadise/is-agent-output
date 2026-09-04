import { expect, it } from "vitest";
import { builtinAgentPatterns, type AgentPattern } from "./builtinAgentPatterns";

interface Sample {
	readonly label: string;
	readonly name: string;
	readonly commandLine?: string;
}

const samples: ReadonlyArray<Sample> = [
	{ label: "claude", name: "claude" },
	{ label: "codex", name: "codex" },
	{ label: "codex-command-runner", name: "codex-command-runner-0.144.6" },
	{ label: "codex-linux-sandbox-fallback", name: "codex-linux-san" },
	{ label: "opencode", name: "opencode" },
	{ label: "grok", name: "grok" },
	{ label: "copilot", name: "copilot" },
	{ label: "droid", name: "droid" },
	{ label: "kimi-linux", name: "kimi code" },
	{ label: "kimi-windows", name: "kimi" },
	{ label: "amp", name: "amp" },
	{ label: "pi-binary", name: "pi" },
	{ label: "goose", name: "goose" },
	{ label: "crush", name: "crush" },
	{ label: "docker-agent", name: "docker-agent" },
	{ label: "cline", name: "cline" },
	{ label: "kilo", name: "kilo" },
	{ label: "gemini-binary", name: "gemini" },
	{ label: "vibe-posix", name: "vibe" },
	{ label: "openhands-binary", name: "openhands" },
	{ label: "codewhale", name: "codewhale" },
	{ label: "reasonix", name: "reasonix" },
	{ label: "reasonix-desktop", name: "reasonix-deskto" },
	{ label: "interpreter", name: "interpreter" },
	{ label: "every-code", name: "code-x86_64-unk" },
	{ label: "kimchi", name: "kimchi" },
	{ label: "omp-linux", name: "omp" },
	{ label: "freebuff", name: "freebuff" },
	{ label: "forge", name: "forge" },
	{ label: "forge-npm", name: "forge-x86_64-un" },
	{ label: "mini-swe-agent-posix", name: "mini" },
	{ label: "gptme-posix", name: "gptme" },
	{
		label: "claude-code-node",
		name: "node",
		commandLine: "/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js",
	},
	{
		label: "auggie",
		name: "node",
		commandLine: "/usr/lib/node_modules/@augmentcode/auggie/augment.mjs",
	},
	{ label: "kimi-macos", name: "python3", commandLine: "/usr/local/bin/kimi" },
	{
		label: "pi-npm",
		name: "node",
		commandLine: "/usr/lib/node_modules/@earendil-works/pi-coding-agent/cli.js",
	},
	{ label: "dsh", name: "node", commandLine: "/usr/lib/node_modules/@deepseek-ai/dsh/cli.js" },
	{ label: "qoder", name: "node", commandLine: "/usr/lib/node_modules/@qoder-ai/qodercli/qodercli.js" },
	{ label: "continue-cn", name: "node", commandLine: "/usr/lib/node_modules/@continuedev/cli/dist/cn.js" },
	{ label: "gemini-npm", name: "node", commandLine: "/usr/lib/node_modules/@google/gemini-cli/index.js" },
	{ label: "qwen", name: "node", commandLine: "/usr/lib/node_modules/@qwen-code/qwen-code/cli.js" },
	{ label: "vibe-windows", name: "python", commandLine: '"C:\\Users\\m\\.local\\bin\\vibe.exe"' },
	{
		label: "openhands-python-windows",
		name: "python",
		commandLine: "C:\\Users\\m\\.venv\\Scripts\\openhands.exe",
	},
	{
		label: "nanocoder",
		name: "node",
		commandLine: "/usr/lib/node_modules/@nanocollective/nanocoder/index.js",
	},
	{ label: "senpi", name: "node", commandLine: "/usr/lib/node_modules/@code-yeongyu/senpi/index.js" },
	{ label: "kimchi-npm", name: "node", commandLine: "/usr/lib/node_modules/@getkimchi/kimchi/index.js" },
	{
		label: "omp-windows",
		name: "bun",
		commandLine: "C:\\Users\\m\\.bun\\install\\global\\node_modules\\@oh-my-pi\\cli.js",
	},
	{
		label: "letta",
		name: "node",
		commandLine: "/usr/lib/node_modules/@letta-ai/letta-code/letta.js",
	},
	{ label: "mini-swe-agent-windows", name: "python", commandLine: "C:\\Users\\m\\.venv\\Scripts\\mini.exe" },
	{ label: "gptme-windows", name: "python", commandLine: "C:\\Users\\m\\.venv\\Scripts\\gptme.exe" },
];

const matches = (pattern: AgentPattern, sample: Sample): boolean => {
	if (!pattern.name.test(sample.name)) {
		return false;
	}

	if (pattern.commandLine === undefined) {
		return true;
	}

	return sample.commandLine !== undefined && pattern.commandLine.test(sample.commandLine);
};

const labelsMatching = (sample: Sample): ReadonlyArray<string> =>
	builtinAgentPatterns.filter((pattern) => matches(pattern, sample)).map((pattern) => pattern.label);

it("carries one sample per builtin harness pattern", () => {
	expect(samples.map((sample) => sample.label)).toEqual(builtinAgentPatterns.map((pattern) => pattern.label));
});

it("resolves every sample to its own label and to no other", () => {
	for (const sample of samples) {
		expect(labelsMatching(sample)).toEqual([sample.label]);
	}
});

it("anchors every builtin name pattern at both ends", () => {
	for (const pattern of builtinAgentPatterns) {
		expect(pattern.name.source.startsWith("^")).toBe(true);
		expect(pattern.name.source.endsWith("$")).toBe(true);
	}
});
