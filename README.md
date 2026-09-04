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
2. stdout is the same object the top ancestor relay inherited at spawn — no authored `|`, `>`, or `$( )` between this process and the harness
3. the first non-relay ancestor matches a known harness, or a pattern you passed in

A harness is in the table when the command's stdout provably reaches the model alone: the harness holds the only handle, and the bytes reach a human only after the harness has chosen to render them. Rows for macOS-only builds are carried for when a macOS provider lands, and stay unreachable until then. Names are the compared form — on Windows the image basename, lowercased and without its extension; on Linux `/proc/<pid>/comm`, which a process can rewrite and which truncates at 15 characters.

| label                          | name                                        | command line                                                            |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| `claude`                       | `/^claude(\.exe)?$/`                        |                                                                         |
| `codex`                        | `/^codex$/`                                 |                                                                         |
| `codex-command-runner`         | `/^codex-command-runner(-\d+\.\d+\.\d+)?$/` |                                                                         |
| `codex-linux-sandbox-fallback` | `/^codex-linux-san(dbox)?$/`                |                                                                         |
| `opencode`                     | `/^opencode(\.exe)?$/`                      |                                                                         |
| `grok`                         | `/^grok$/`                                  |                                                                         |
| `copilot`                      | `/^copilot$/`                               |                                                                         |
| `droid`                        | `/^droid$/`                                 |                                                                         |
| `kimi-linux`                   | `/^kimi code$/`                             |                                                                         |
| `kimi-windows`                 | `/^kimi$/`                                  |                                                                         |
| `amp`                          | `/^amp(\.exe)?$/`                           |                                                                         |
| `pi-binary`                    | `/^pi$/`                                    |                                                                         |
| `goose`                        | `/^goose$/`                                 |                                                                         |
| `crush`                        | `/^crush$/`                                 |                                                                         |
| `docker-agent`                 | `/^docker-agent$/`                          |                                                                         |
| `cline`                        | `/^cline$/`                                 |                                                                         |
| `kilo`                         | `/^kilo$/`                                  |                                                                         |
| `gemini-binary`                | `/^gemini$/`                                |                                                                         |
| `vibe-posix`                   | `/^vibe$/`                                  |                                                                         |
| `openhands-binary`             | `/^openhands$/`                             |                                                                         |
| `codewhale`                    | `/^(codewhale\|codew)$/`                    |                                                                         |
| `reasonix`                     | `/^reasonix$/`                              |                                                                         |
| `reasonix-desktop`             | `/^reasonix-deskto(p)?$/`                   |                                                                         |
| `interpreter`                  | `/^interpreter$/`                           |                                                                         |
| `every-code`                   | `/^code-(x86_64\|aarch64)-[a-z0-9._-]*$/`   |                                                                         |
| `kimchi`                       | `/^kimchi$/`                                |                                                                         |
| `omp-linux`                    | `/^omp$/`                                   |                                                                         |
| `freebuff`                     | `/^(freebuff\|codebuff)$/`                  |                                                                         |
| `forge`                        | `/^forge$/`                                 |                                                                         |
| `forge-npm`                    | `/^forge-(x86_64\|aarch64)-[a-z0-9._-]*$/`  |                                                                         |
| `mini-swe-agent-posix`         | `/^mini(-swe-agent)?$/`                     |                                                                         |
| `gptme-posix`                  | `/^gptme$/`                                 |                                                                         |
| `claude-code-node`             | `/^node$/`                                  | `/claude-code\|@anthropic-ai[\\/]claude/`                               |
| `auggie`                       | `/^node$/`                                  | `/[\\/]augment\.mjs(\s\|$)/`                                            |
| `kimi-macos`                   | `/^python3(\.\d+)?$/`                       | `/kimi_cli[\\/]__main__\|[\\/]bin[\\/]kimi$/`                           |
| `pi-npm`                       | `/^node$/`                                  | `/@earendil-works[\\/]pi-coding-agent/`                                 |
| `dsh`                          | `/^node$/`                                  | `/@deepseek-ai[\\/]dsh/`                                                |
| `qoder`                        | `/^node$/`                                  | `/@qoder-ai[\\/]qodercli/`                                              |
| `continue-cn`                  | `/^node$/`                                  | `/@continuedev[\\/]cli[\\/]dist[\\/]cn\.js/`                            |
| `gemini-npm`                   | `/^node$/`                                  | `/(^\|[\\/])gemini(\.js)?(\s\|$)\|@google[\\/]gemini-cli/`              |
| `qwen`                         | `/^node$/`                                  | `/@qwen-code[\\/]qwen-code[\\/]cli\.js\|qwen-code[\\/]lib[\\/]cli\.js/` |
| `vibe-windows`                 | `/^python$/`                                | `/vibe(-acp\|-app-server)?\.exe"?$/`                                    |
| `openhands-python-windows`     | `/^python$/`                                | `/[\\/]Scripts[\\/]openhands(\.exe)?/`                                  |
| `nanocoder`                    | `/^node$/`                                  | `/@nanocollective[\\/]nanocoder/`                                       |
| `senpi`                        | `/^node$/`                                  | `/@code-yeongyu[\\/]senpi/`                                             |
| `kimchi-npm`                   | `/^node$/`                                  | `/@getkimchi[\\/]kimchi/`                                               |
| `omp-windows`                  | `/^bun$/`                                   | `/pi-coding-agent\|@oh-my-pi/`                                          |
| `letta`                        | `/^node$/`                                  | `/@letta-ai[\\/]letta-code[\\/]letta\.js/`                              |
| `mini-swe-agent-windows`       | `/^python$/`                                | `/[\\/]mini(-swe-agent)?(\.exe)?$/`                                     |
| `gptme-windows`                | `/^python$/`                                | `/[\\/]gptme(\.exe)?$/`                                                 |

Anything else is `false`, and `reason` names the check that failed.

Every builtin harness regex is anchored at both ends, so a harness outside the table is an `--agent` entry rather than an accidental substring match. Ancestry names the consumer; inherited environment markers do not.

### Relays

The walk skips relays and takes the first ancestor that is not one as the consumer.

| name                     | command line                                                  | attests |
| ------------------------ | ------------------------------------------------------------- | ------- |
| `/^bash$/`               |                                                               | true    |
| `/^sh$/`                 |                                                               | true    |
| `/^dash$/`               |                                                               | true    |
| `/^zsh$/`                |                                                               | true    |
| `/^cmd$/`                |                                                               | true    |
| `/^powershell$/`         |                                                               | true    |
| `/^pwsh$/`               |                                                               | true    |
| `/^env$/`                |                                                               | true    |
| `/^ash$/`                |                                                               | true    |
| `/^ksh$/`                |                                                               | true    |
| `/^mksh$/`               |                                                               | true    |
| `/^fish$/`               |                                                               | true    |
| `/^elvish$/`             |                                                               | true    |
| `/^nice$/`               |                                                               | true    |
| `/^nohup$/`              |                                                               | true    |
| `/^timeout$/`            |                                                               | true    |
| `/^stdbuf$/`             |                                                               | true    |
| `/^chroot$/`             |                                                               | true    |
| `/^ionice$/`             |                                                               | true    |
| `/^chrt$/`               |                                                               | true    |
| `/^taskset$/`            |                                                               | true    |
| `/^bwrap$/`              |                                                               | true    |
| `/^apply-seccomp$/`      |                                                               | true    |
| `/^sandbox-exec$/`       |                                                               | true    |
| `/^srt-win$/`            |                                                               | true    |
| `/^cursorsandbox$/`      |                                                               | true    |
| `/^geminisandbox$/`      |                                                               | true    |
| `/^wxc-exec$/`           |                                                               | true    |
| `/^node$/`               | `/[\\/](?:npm-cli\.js\|npx-cli\.js\|pnpm\.cjs)(?:["'\s]\|$)/` | false   |
| `/^npm\s/`               |                                                               | false   |
| `/^(?:npm\|npx\|pnpm)$/` |                                                               | false   |

The last three rows are package runners: the `node` process running `npm-cli.js`, `npx-cli.js`, or `pnpm.cjs`; npm's rewritten Linux process title, which reads `npm run <script>`; and the Windows shim images `npm.exe`, `npx.exe`, and `pnpm.exe`. Each passes its child fd 1 untouched, so `npm run build` under a harness answers true. Each also sets `attests: false`, because a shell can apply a redirect and then exec into the runner, leaving the runner as the outermost relay holding the redirected file as its own fd 1; a file sink whose outermost relay attests nothing fails closed with `file sink attested by a runner`.

A runner whose pass-through depends on its flags is a consumer rather than a relay. `make -O` hands its child a temporary file as fd 1, which nothing observable distinguishes from harness capture, so `make` and its kind stay out.

## CLI

```sh
is-agent-output        # exit 0 when true, 1 when false
is-agent-output --json # print the Detection object
```

```sh
is-agent-output [--json] [--agent <label>:<nameRegex>[:<commandLineRegex>]]... [--relay <nameRegex>[:<commandLineRegex>]]...
```

Exit 2 is a usage error.

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

Both flags are repeatable, and both lists append after the builtins. An `--agent` value splits at its first two colons: label, name regex, optional command-line regex. A `--relay` value splits at its first colon: name regex, optional command-line regex.

A `--relay` entry always attests a file sink, since the flag carries no place to say otherwise. A package runner therefore belongs in `options.relays` with `attests: false` rather than on the command line.

## Limits

- The tty check is a fast path rather than a guarantee. Under `mintty`, Git Bash's own terminal, fd 1 is a named pipe while a human watches every byte, and it is the ancestry check that rejects the case by resolving the consumer to `mintty`.
- A persistent shell whose intermediate parent has already exited ends the walk. Claude Code on Windows shows this one shell layer deep: `bash script.sh` inside its session reports `ancestor <pid> unresolvable`.
- A PID namespace whose PID 1 is the sandbox hides the harness. Claude Code and Gemini CLI leave `bwrap` at PID 1 on Linux, so the walk reports `ancestry ends at <name> with no consumer`.
- The WSL boundary hides the harness. A Windows harness invoking `wsl -e …`, or a WSL harness invoking a Windows `.exe`, leaves no ancestry path across the boundary.
- A harness that mirrors a private pipe to its own terminal is indistinguishable from one that does not. Nothing observable from inside the child separates them, so such harnesses are excluded by the table rather than at runtime; Amazon Q Developer CLI and Aider on Windows are the measured cases.
- A pty-capturing harness answers false at the tty check. Gemini CLI's interactive default, Copilot CLI inside VS Code, and Codex under `tty: true` all reach the model alone through a pty, and `isatty(1)` is true, so the answer is a safe false.
- A redirect an agent writes inside a script file, applies with `exec >`, or hides behind `eval` or a command substitution never reaches a relay's command line and is invisible to the file branch. A relay command line naming a script file it does not source therefore fails the sink closed with `unreadable script in a relay command line`. A sourced script is exempt so that a harness which sources setup still resolves: Claude Code prefixes every command with `source <shell snapshot>.sh`, and treating that as unreadable would answer false for the harness this package exists to recognise. A redirect that never appears in a relay's command line at all — inside a sourced script, behind `eval`, or aimed at a symlink whose name differs from the file it resolves to — is therefore still invisible, and that residual is accepted.

## Platforms

Windows and Linux. Other platforms return `false` with reason `unsupported platform`.

## License

[MIT](LICENSE)
