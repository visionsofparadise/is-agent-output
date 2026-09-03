# is-agent-output

From inside a process, reports whether stdout is going unmediated to an AI agent harness.

## Install

```sh
npm install is-agent-output
```

## Library

```ts
import { detectAgentOutput } from "is-agent-output";

const detection = detectAgentOutput();

if (detection.isAgentOutput) {
	// stdout is the harness capture; transform is safe
}
```

```ts
interface Detection {
	readonly isAgentOutput: boolean;
	readonly consumer?: { readonly pid: number; readonly name: string; readonly label?: string };
	readonly reason: string;
}
```

`isAgentOutput` is true when all three hold:

1. stdout is not a tty
2. stdout is the same object the top ancestor shell inherited at spawn — no authored `|`, `>`, or `$( )` between this process and the harness
3. the first non-shell ancestor matches a known harness, or a pattern you passed in

| label              | process name | command line                            |
| ------------------ | ------------ | --------------------------------------- |
| `claude`           | `claude`     |                                         |
| `codex`            | `codex`      |                                         |
| `opencode`         | `opencode`   |                                         |
| `grok`             | `grok`       |                                         |
| `claude-code-node` | `node`       | `claude-code` or `@anthropic-ai/claude` |

Anything else is `false`, and `reason` names the check that failed.

The walk skips shells (`bash`, `sh`, `dash`, `zsh`, `cmd`, `powershell`, `pwsh`) and the `env` shebang launcher. Ancestry names the consumer; inherited environment markers do not.

## CLI

```sh
is-agent-output        # exit 0 when true, 1 when false
is-agent-output --json # print the Detection object
```

Exit 2 is a usage error.

## Extra harnesses

```ts
detectAgentOutput({
	agents: [{ label: "my-harness", name: /my-harness/, commandLine: /optional/ }],
});
```

```sh
is-agent-output --agent 'my-harness:my-harness[:commandLineRegex]'
```

`--agent` is repeatable. The value splits at its first two colons: label, name regex, optional command-line regex.

## Platforms

Windows and Linux. Other platforms return `false` with reason `unsupported platform`.

## License

[MIT](LICENSE)
