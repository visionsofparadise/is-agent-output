import { readFileSync, readlinkSync } from "node:fs";
import type { ProcessInfo, Provider, StdoutSink } from "./Provider";

const procPathOf = (pid: number, leaf: string): string => `/proc/${pid}/${leaf}`;

const isPid = (pid: number): boolean => Number.isInteger(pid) && pid > 0;

const linkOf = (path: string): string | undefined => {
	try {
		return readlinkSync(path);
	} catch {
		return undefined;
	}
};

const parentPidOf = (stat: string): number | undefined => {
	const closeParen = stat.lastIndexOf(")");

	if (closeParen < 0) {
		return undefined;
	}

	const fields = stat.slice(closeParen + 2).split(" ");
	const parentField = fields[1];

	if (parentField === undefined) {
		return undefined;
	}

	const ppid = Number(parentField);

	return isPid(ppid) ? ppid : undefined;
};

const processInfoOf = (pid: number): ProcessInfo | undefined => {
	if (!isPid(pid)) {
		return undefined;
	}

	try {
		const comm = readFileSync(procPathOf(pid, "comm"), "utf8").trim().toLowerCase();
		const stat = readFileSync(procPathOf(pid, "stat"), "utf8");

		return {
			pid,
			ppid: parentPidOf(stat),
			name: comm,
		};
	} catch {
		return undefined;
	}
};

const commandLineOf = (pid: number): string | undefined => {
	if (!isPid(pid)) {
		return undefined;
	}

	try {
		const cmdline = readFileSync(procPathOf(pid, "cmdline"), "utf8").replaceAll("\0", " ").trim();

		return cmdline.length > 0 ? cmdline : undefined;
	} catch {
		return undefined;
	}
};

const stdoutSinkOf = (): StdoutSink => {
	if (process.stdout.isTTY) {
		return { kind: "tty", identity: linkOf("/proc/self/fd/1") };
	}

	const identity = linkOf("/proc/self/fd/1");

	if (identity === undefined) {
		return { kind: "unknown" };
	}

	if (identity.startsWith("/")) {
		return { kind: "file", path: identity };
	}

	return { kind: "stream", serverPid: undefined, identity };
};

const fd1IdentityOf = (pid: number): string | undefined => {
	if (!isPid(pid)) {
		return undefined;
	}

	return linkOf(procPathOf(pid, "fd/1"));
};

export const linuxProvider: Provider = {
	processInfoOf,
	commandLineOf,
	stdoutSinkOf,
	fd1IdentityOf,
};
