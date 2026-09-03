export interface AgentPattern {
	readonly label: string;
	readonly name: RegExp;
	readonly commandLine?: RegExp;
}

export const builtinAgentPatterns: ReadonlyArray<AgentPattern> = [
	{ label: "claude", name: /^claude$/ },
	{ label: "codex", name: /^codex$/ },
	{ label: "opencode", name: /^opencode$/ },
	{ label: "grok", name: /^grok$/ },
	{
		label: "claude-code-node",
		name: /^node$/,
		commandLine: /claude-code|@anthropic-ai[\\/]claude/,
	},
];
