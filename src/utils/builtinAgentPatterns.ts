export interface AgentPattern {
	readonly label: string;
	readonly name: RegExp;
	readonly commandLine?: RegExp;
}

export const builtinAgentPatterns: ReadonlyArray<AgentPattern> = [
	{ label: "claude", name: /claude(\.exe)?/ },
	{ label: "codex", name: /codex(\.exe)?/ },
	{ label: "opencode", name: /opencode(\.exe)?/ },
	{ label: "grok", name: /grok(\.exe)?/ },
	{
		label: "claude-code-node",
		name: /node(\.exe)?/,
		commandLine: /claude-code|@anthropic-ai[\\/]claude/,
	},
];
