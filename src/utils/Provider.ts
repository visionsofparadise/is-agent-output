export interface ProcessInfo {
	readonly pid: number;
	readonly ppid: number | undefined;
	readonly name: string;
}

export type StdoutSink =
	| { readonly kind: "tty" }
	| { readonly kind: "pipe"; readonly serverPid: number | undefined; readonly identity: string | undefined }
	| { readonly kind: "file"; readonly path: string }
	| { readonly kind: "unknown" };

export interface Provider {
	readonly processInfoOf: (pid: number) => ProcessInfo | undefined;
	readonly commandLineOf: (pid: number) => string | undefined;
	readonly stdoutSinkOf: () => StdoutSink;
	readonly fd1IdentityOf: (pid: number) => string | undefined;
}
