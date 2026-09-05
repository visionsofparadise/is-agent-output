export interface ProcessInfo {
	readonly pid: number;
	readonly ppid: number | undefined;
	readonly name: string;
}

export type StdoutSink =
	| { readonly kind: "tty"; readonly identity?: string | undefined }
	| { readonly kind: "stream"; readonly serverPid: number | undefined; readonly identity: string | undefined }
	| { readonly kind: "file"; readonly path: string }
	| { readonly kind: "unknown" };

export interface Provider {
	readonly processInfoOf: (pid: number) => ProcessInfo | undefined;
	readonly commandLineOf: (pid: number) => string | undefined;
	/**
	 * The basename a process presents in argv[0], which `exec -a` can set independently of the image name.
	 */
	readonly argv0Of?: (pid: number) => string | undefined;
	readonly stdoutSinkOf: () => StdoutSink;
	readonly fd1IdentityOf: (pid: number) => string | undefined;
}
