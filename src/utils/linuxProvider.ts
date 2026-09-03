import { readFileSync, readlinkSync } from "node:fs";
import type { ProcessInfo, Provider, StdoutSink } from "./Provider";

const procPathOf = (pid: number, leaf: string): string => `/proc/${pid}/${leaf}`;

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

	return Number.isFinite(ppid) ? ppid : undefined;
};

const processInfoOf = (pid: number): ProcessInfo | undefined => {
	if (!Number.isInteger(pid) || pid <= 0) {
		return undefined;
	}

	try {
		const comm = readFileSync(procPathOf(pid, "comm"), "utf8").trim().toLowerCase();
		const cmdline = readFileSync(procPathOf(pid, "cmdline"), "utf8").replaceAll("\0", " ").trim();
		const stat = readFileSync(procPathOf(pid, "stat"), "utf8");

		return {
			pid,
			ppid: parentPidOf(stat),
			name: comm,
			commandLine: cmdline.length > 0 ? cmdline : undefined,
		};
	} catch {
		return undefined;
	}
};

const stdoutSinkOf = (): StdoutSink => {
	if (process.stdout.isTTY) {
		return { kind: "tty" };
	}

	try {
		const identity = readlinkSync("/proc/self/fd/1");

		if (identity.startsWith("pipe:")) {
			return { kind: "pipe", serverPid: undefined, identity };
		}

		if (identity.startsWith("/")) {
			return { kind: "file", path: identity };
		}

		return { kind: "unknown" };
	} catch {
		return { kind: "unknown" };
	}
};

const fd1IdentityOf = (pid: number): string | undefined => {
	if (!Number.isInteger(pid) || pid <= 0) {
		return undefined;
	}

	try {
		return readlinkSync(procPathOf(pid, "fd/1"));
	} catch {
		return undefined;
	}
};

export const linuxProvider: Provider = {
	processInfoOf,
	stdoutSinkOf,
	fd1IdentityOf,
};
