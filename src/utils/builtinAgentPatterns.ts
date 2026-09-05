export interface AgentPattern {
	readonly label: string;
	readonly name: RegExp;
	readonly commandLine?: RegExp;
}

export const builtinAgentPatterns: ReadonlyArray<AgentPattern> = [
	{ label: "claude", name: /^claude(\.exe)?$/ },
	{ label: "codex", name: /^codex$/ },
	{ label: "codex-command-runner", name: /^codex-command-runner(-\d+\.\d+\.\d+)?$/ },
	{ label: "codex-linux-sandbox-fallback", name: /^codex-linux-san(dbox)?$/ },
	{ label: "opencode", name: /^opencode(\.exe)?$/ },
	{ label: "grok", name: /^grok$/ },
	{ label: "copilot", name: /^copilot$/ },
	{ label: "droid", name: /^droid$/ },
	{ label: "kimi-linux", name: /^kimi code$/ },
	{ label: "kimi-windows", name: /^kimi$/ },
	{ label: "amp", name: /^amp(\.exe)?$/ },
	{ label: "pi-binary", name: /^pi$/ },
	{ label: "goose", name: /^goose$/ },
	{ label: "crush", name: /^crush$/ },
	{ label: "docker-agent", name: /^docker-agent$/ },
	{ label: "cline", name: /^cline$/ },
	{ label: "kilo", name: /^kilo$/ },
	{ label: "gemini-binary", name: /^gemini$/ },
	{ label: "vibe-posix", name: /^vibe$/ },
	{ label: "openhands-binary", name: /^openhands$/ },
	{ label: "codewhale", name: /^(codewhale|codew)$/ },
	{ label: "reasonix", name: /^reasonix$/ },
	{ label: "reasonix-desktop", name: /^reasonix-deskto(p)?$/ },
	{ label: "interpreter", name: /^interpreter$/ },
	{ label: "every-code", name: /^code-(x86_64|aarch64)-[a-z0-9._-]*$/ },
	{ label: "kimchi", name: /^kimchi$/ },
	{ label: "omp-linux", name: /^omp$/ },
	{ label: "freebuff", name: /^(freebuff|codebuff)$/ },
	{ label: "forge", name: /^forge$/ },
	{ label: "forge-npm", name: /^forge-(x86_64|aarch64)-[a-z0-9._-]*$/ },
	{ label: "mini-swe-agent-posix", name: /^mini(-swe-agent)?$/ },
	{ label: "gptme-posix", name: /^gptme$/ },
	{ label: "warp", name: /^warp(-terminal)?$/ },
	{ label: "aider-posix", name: /^aider$/ },
	{ label: "swe-agent-posix", name: /^sweagent$/ },
	{
		label: "claude-code-node",
		name: /^node$/,
		commandLine: /claude-code|@anthropic-ai[\\/]claude/,
	},
	{
		label: "auggie",
		name: /^node$/,
		commandLine: /[\\/]augment\.mjs(\s|$)/,
	},
	{
		label: "kimi-macos",
		name: /^python3(\.\d+)?$/,
		commandLine: /kimi_cli[\\/]__main__|[\\/]bin[\\/]kimi$/,
	},
	{
		label: "pi-npm",
		name: /^node$/,
		commandLine: /@earendil-works[\\/]pi-coding-agent/,
	},
	{
		label: "dsh",
		name: /^node$/,
		commandLine: /@deepseek-ai[\\/]dsh/,
	},
	{
		label: "qoder",
		name: /^node$/,
		commandLine: /@qoder-ai[\\/]qodercli/,
	},
	{
		label: "continue-cn",
		name: /^node$/,
		commandLine: /@continuedev[\\/]cli[\\/]dist[\\/]cn\.js/,
	},
	{
		label: "gemini-npm",
		name: /^node$/,
		commandLine: /(^|[\\/])gemini(\.js)?(\s|$)|@google[\\/]gemini-cli/,
	},
	{
		label: "qwen",
		name: /^node$/,
		commandLine: /@qwen-code[\\/]qwen-code[\\/]cli\.js|qwen-code[\\/]lib[\\/]cli\.js/,
	},
	{
		label: "vibe-windows",
		name: /^python$/,
		commandLine: /vibe(-acp|-app-server)?\.exe"?$/,
	},
	{
		label: "openhands-python-windows",
		name: /^python$/,
		commandLine: /[\\/]openhands\.exe/,
	},
	{
		label: "nanocoder",
		name: /^node$/,
		commandLine: /@nanocollective[\\/]nanocoder/,
	},
	{
		label: "senpi",
		name: /^node$/,
		commandLine: /@code-yeongyu[\\/]senpi/,
	},
	{
		label: "kimchi-npm",
		name: /^node$/,
		commandLine: /@getkimchi[\\/]kimchi/,
	},
	{
		label: "omp-windows",
		name: /^bun$/,
		commandLine: /pi-coding-agent|@oh-my-pi/,
	},
	{
		label: "letta",
		name: /^node$/,
		commandLine: /@letta-ai[\\/]letta-code[\\/]letta\.js/,
	},
	{
		label: "mini-swe-agent-windows",
		name: /^python$/,
		commandLine: /[\\/]mini(-swe-agent)?(\.exe)?$/,
	},
	{
		label: "gptme-windows",
		name: /^python$/,
		commandLine: /[\\/]gptme(\.exe)?$/,
	},
	{
		label: "cursor-agent",
		name: /^node$/,
		commandLine: /[\\/]cursor-agent[\\/]versions[\\/]/,
	},
	{
		label: "aider-windows",
		name: /^python$/,
		commandLine: /[\\/]aider\.exe/,
	},
];
