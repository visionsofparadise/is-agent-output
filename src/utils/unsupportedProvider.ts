import type { ProcessInfo, Provider, StdoutSink } from "./Provider";

export const unsupportedProvider: Provider = {
	processInfoOf: (_pid: number): ProcessInfo | undefined => undefined,
	commandLineOf: (_pid: number): string | undefined => undefined,
	argv0Of: (_pid: number): string | undefined => undefined,
	stdoutSinkOf: (): StdoutSink => ({ kind: "unknown" }),
	fd1IdentityOf: (_pid: number): string | undefined => undefined,
};
