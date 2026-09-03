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

itLinux("stdoutSinkOf returns a non-unknown kind under the test runner", () => {
	const sink = linuxProvider.stdoutSinkOf();

	expect(sink.kind).not.toBe("unknown");
});

itLinux("processInfoOf(-1) returns undefined", () => {
	expect(linuxProvider.processInfoOf(-1)).toBeUndefined();
});
