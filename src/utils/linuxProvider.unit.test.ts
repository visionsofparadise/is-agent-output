import { readlinkSync } from "node:fs";
import { expect, it } from "vitest";
import { linuxProvider } from "./linuxProvider";

const itLinux = process.platform === "linux" ? it : it.skip;

itLinux("processInfoOf resolves the current process and its parent", () => {
	const info = linuxProvider.processInfoOf(process.pid);

	expect(info).toBeDefined();
	expect(info?.name).toContain("node");
	expect(info?.ppid).toEqual(expect.any(Number));

	const parent = linuxProvider.processInfoOf(info?.ppid ?? -1);

	expect(parent).toBeDefined();
});

itLinux("stdoutSinkOf classifies whatever its own fd 1 is", () => {
	const sink = linuxProvider.stdoutSinkOf();

	if (process.stdout.isTTY) {
		expect(sink).toEqual({ kind: "tty", identity: readlinkSync("/proc/self/fd/1") });

		return;
	}

	const link = readlinkSync("/proc/self/fd/1");

	if (link.startsWith("/")) {
		expect(sink).toEqual({ kind: "file", path: link });

		return;
	}

	expect(sink).toEqual({ kind: "stream", serverPid: undefined, identity: link });
});

itLinux("processInfoOf reports no parent for the pid at the top of the namespace", () => {
	expect(linuxProvider.processInfoOf(1)?.ppid).toBeUndefined();
});

itLinux("processInfoOf(-1) returns undefined", () => {
	expect(linuxProvider.processInfoOf(-1)).toBeUndefined();
});

itLinux("commandLineOf resolves the current process command line", () => {
	expect(linuxProvider.commandLineOf(process.pid)).toContain("node");
});

itLinux("commandLineOf(-1) returns undefined", () => {
	expect(linuxProvider.commandLineOf(-1)).toBeUndefined();
});

itLinux("argv0Of resolves the name the current process presents", () => {
	expect(linuxProvider.argv0Of?.(process.pid)).toContain("node");
});

itLinux("argv0Of(-1) returns undefined", () => {
	expect(linuxProvider.argv0Of?.(-1)).toBeUndefined();
});
