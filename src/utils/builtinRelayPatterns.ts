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
