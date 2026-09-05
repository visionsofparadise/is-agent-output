export interface RelayPattern {
	readonly name: RegExp;
	readonly commandLine?: RegExp;
	/**
	 * Default true: a surviving frame of this relay proves a file sink reached it unredirected; runners set false.
	 */
	readonly attests?: boolean;
}

export const builtinRelayPatterns: ReadonlyArray<RelayPattern> = [
	{ name: /^bash$/ },
	{ name: /^sh$/ },
	{ name: /^dash$/ },
	{ name: /^zsh$/ },
	{ name: /^cmd$/ },
	{ name: /^powershell$/ },
	{ name: /^pwsh$/ },
	{ name: /^env$/ },
	{ name: /^ash$/ },
	{ name: /^ksh$/ },
	{ name: /^mksh$/ },
	{ name: /^fish$/ },
	{ name: /^elvish$/ },
	{ name: /^nice$/ },
	{ name: /^nohup$/ },
	{ name: /^timeout$/ },
	{ name: /^stdbuf$/ },
	{ name: /^chroot$/ },
	{ name: /^ionice$/ },
	{ name: /^chrt$/ },
	{ name: /^taskset$/ },
	{ name: /^bwrap$/ },
	{ name: /^apply-seccomp$/ },
	{ name: /^sandbox-exec$/ },
	{ name: /^srt-win$/ },
	{ name: /^cursorsandbox$/ },
	{ name: /^geminisandbox$/ },
	{ name: /^wxc-exec$/ },
	{
		/**
		 * npm's node process.
		 */
		name: /^node$/,
		commandLine: /[\\/](?:npm-cli\.js|npx-cli\.js|pnpm\.cjs|yarn\.js)(?:["'\s]|$)/,
		attests: false,
	},
	{
		/**
		 * npm's rewritten Linux title.
		 */
		name: /^npm\s/,
		attests: false,
	},
	{
		/**
		 * The Windows shim image.
		 */
		name: /^(?:npm|npx|pnpm|yarn)$/,
		attests: false,
	},
	{
		/**
		 * Node's own script runner.
		 */
		name: /^node$/,
		commandLine: /\s--run(?:[=\s]|$)/,
		attests: false,
	},
	{
		/**
		 * Bun's script runner, qualified so oh-my-pi's own bun stays a consumer.
		 */
		name: /^bun$/,
		commandLine: /(?:^|[\\/\s"'])bun(?:\.exe)?["']?\s+run\s/,
		attests: false,
	},
	{
		/**
		 * Deno's task runner.
		 */
		name: /^deno$/,
		commandLine: /(?:^|[\\/\s"'])deno(?:\.exe)?["']?\s+task\s/,
		attests: false,
	},
	{
		/**
		 * Python packaging runners.
		 */
		name: /^(?:uv|uvx|pipx|poetry|pdm)$/,
		attests: false,
	},
	{
		/**
		 * Compiled-language toolchain runners.
		 */
		name: /^(?:cargo|go|dotnet)$/,
		attests: false,
	},
	{
		/**
		 * TypeScript loaders.
		 */
		name: /^(?:tsx|ts-node)$/,
		attests: false,
	},
	{
		/**
		 * Environment loader.
		 */
		name: /^direnv$/,
		attests: false,
	},
];
