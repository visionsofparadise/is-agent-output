# is-agent-output

From inside a process, reports whether stdout is going unmediated to an AI agent harness.

## Install

```sh
npm install is-agent-output
```

## Usage

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

`isAgentOutput` is true when both hold:

1. the first non-relay ancestor matches a [known harness](#harnesses), or a pattern you passed in
2. no pipe or redirect sits between this process and the harness, only [known relays](#relays), which pass output straight through

Following these rules ensures any other consumers, such as piping or file writes, are not taken as agent output. It defaults to false in unclear or mixed scenarios.

One exception to that default. When your output goes to a terminal on Windows, nothing tells the package which terminal it is, so it reads the surrounding commands instead. A redirect written in a form it does not recognise answers true there.

### Harnesses

A harness is in the table when the command's output reaches a model, and reaches nothing that a change in the output would break.

| Harness           | Harness            | Harness          |
| ----------------- | ------------------ | ---------------- |
| Aider ¹           | Every Code         | Mistral Vibe     |
| Amp               | Factory Droid      | Nanocoder        |
| Auggie            | Forge              | oh-my-pi         |
| Claude Code       | Freebuff           | opencode         |
| Claude Desktop    | Gemini CLI         | opencode desktop |
| Cline             | GitHub Copilot CLI | Open Interpreter |
| Codex             | goose              | OpenHands        |
| Codex desktop app | goose desktop      | Pi               |
| CodeWhale         | gptme              | Qoder            |
| Continue          | Grok CLI           | Qwen Code        |
| Crush             | Kilo Code          | Reasonix         |
| Cursor CLI        | Kimchi             | Reasonix desktop |
| DeepSeek dsh      | Kimi CLI           | senpi            |
| Docker Agent      | Letta Code         | SWE-agent ²      |
| Docker Desktop    | mini-swe-agent     | Warp             |

¹ Aider is recognised where its own installer puts it. Some Python installations put it somewhere the package cannot recognise, and it answers false there.

² SWE-agent is recognised when it runs your command on the same machine. Its default mode runs commands inside a container, where nothing identifies SWE-agent as the caller.

Agents running inside an editor are not covered: Cline, Continue, Copilot and Gemini Code Assist in VS Code, and the Cursor, Zed, Windsurf, Trae, Kiro, Devin and Junie agents. The editor launches everything you run in it, your linters and formatters included, so nothing tells a command its agent ran from one an extension ran.

### Relays

The walk skips relays and takes the first ancestor that is not one as the consumer.

| passes output through | recognised as                                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shells                | `bash`, `sh`, `dash`, `zsh`, `ash`, `ksh`, `mksh`, `fish`, `elvish`, `cmd`, `powershell`, `pwsh`                                                                  |
| launchers             | `env`, `nice`, `nohup`, `timeout`, `stdbuf`, `chroot`, `ionice`, `chrt`, `taskset`                                                                                |
| sandbox wrappers      | `bwrap`, `apply-seccomp`, `sandbox-exec`, and the wrappers Claude Code, Cursor, Gemini CLI, Codex, and VS Code ship                                               |
| package runners       | `npm run`, `npx`, `pnpm`, `yarn`, `node --run`, `bun run`, `deno task`, `uv`, `uvx`, `pipx`, `poetry`, `pdm`, `cargo`, `go`, `dotnet`, `tsx`, `ts-node`, `direnv` |

## Extra harnesses and relays

```ts
detectAgentOutput({
	agents: [{ label: "my-harness", name: /my-harness/, commandLine: /optional/ }],
	relays: [{ name: /my-runner/, commandLine: /optional/, attests: false }],
});
```

## License

[MIT](LICENSE)
