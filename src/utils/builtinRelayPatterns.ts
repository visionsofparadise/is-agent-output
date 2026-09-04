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
		commandLine: /[\\/](?:npm-cli\.js|npx-cli\.js|pnpm\.cjs)(?:["'\s]|$)/,
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
		name: /^(?:npm|npx|pnpm)$/,
		attests: false,
	},
];
