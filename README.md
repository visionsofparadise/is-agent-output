# is-agent-output

From inside a process, reports whether stdout is going unmediated to an AI agent harness.

## Install

```sh
npm install is-agent-output
```

## Usage

```sh
is-agent-output        # exit 0 when true, 1 when false
is-agent-output --json # print the Detection object
```

```sh
is-agent-output [--json] [--agent <label>:<nameRegex>[:<commandLineRegex>]]... [--relay <nameRegex>[:<commandLineRegex>]]...
```

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
2. the first non-relay ancestor matches a [known harness](#harnesses), or a pattern you passed in
3. no pipe or redirect sits between this process and the harness — only [known relays](#relays), which pass output straight through

Following these rules ensures any other consumers, such as piping or file writes, are not taken as agent output. It defaults to false in unclear or mixed scenarios.

### Harnesses

A harness is in the table when the command's stdout provably reaches the model alone.

| Harness       | Harness            | Harness          |
| ------------- | ------------------ | ---------------- |
| Amp           | Forge              | Mistral Vibe     |
| Auggie        | Freebuff           | Nanocoder        |
| Claude Code   | Gemini CLI         | oh-my-pi         |
| Cline         | GitHub Copilot CLI | opencode         |
| Codex         | goose              | Open Interpreter |
| CodeWhale     | gptme              | OpenHands        |
| Continue      | Grok CLI           | Pi               |
| Crush         | Kilo Code          | Qoder            |
| DeepSeek dsh  | Kimchi             | Qwen Code        |
| Docker Agent  | Kimi CLI           | Reasonix         |
| Every Code    | Letta Code         | senpi            |
| Factory Droid | mini-swe-agent     |                  |

### Relays

The walk skips relays and takes the first ancestor that is not one as the consumer.

| passes output through | recognised as                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| shells                | `bash`, `sh`, `dash`, `zsh`, `ash`, `ksh`, `mksh`, `fish`, `elvish`, `cmd`, `powershell`, `pwsh` |
| launchers             | `env`, `nice`, `nohup`, `timeout`, `stdbuf`, `chroot`, `ionice`, `chrt`, `taskset`               |
| sandbox wrappers      | `bwrap`, `apply-seccomp`, `sandbox-exec`, and the wrappers Cursor, Gemini CLI, and Codex ship    |
| package runners       | `npm run`, `npx`, `pnpm`                                                                         |

## Extra harnesses and relays

```ts
detectAgentOutput({
	agents: [{ label: "my-harness", name: /my-harness/, commandLine: /optional/ }],
	relays: [{ name: /my-runner/, commandLine: /optional/, attests: false }],
});
```

```sh
is-agent-output --agent 'my-harness:my-harness[:commandLineRegex]' --relay 'my-relay[:commandLineRegex]'
```

## License

[MIT](LICENSE)
