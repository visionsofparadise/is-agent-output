import { expect, it } from "vitest";
import { windowsProvider } from "./windowsProvider";

const itWindows = process.platform === "win32" ? it : it.skip;

itWindows("processInfoOf resolves the current process and its parent", () => {
	const info = windowsProvider.processInfoOf(process.pid);

	expect(info).toBeDefined();
	expect(info?.name).toContain("node");
	expect(info?.ppid).toEqual(expect.any(Number));

	const parent = windowsProvider.processInfoOf(info?.ppid ?? -1);

	expect(parent).toBeDefined();
});

itWindows("stdoutSinkOf returns a non-unknown kind under the test runner", () => {
	const sink = windowsProvider.stdoutSinkOf();

	expect(sink.kind).not.toBe("unknown");
});

itWindows("stdoutSinkOf carries no terminal identity, since Windows names no device for a console handle", () => {
	const sink = windowsProvider.stdoutSinkOf();

	if (sink.kind !== "tty") {
		return;
	}

	expect(sink.identity).toBeUndefined();
});

itWindows("processInfoOf(-1) returns undefined", () => {
	expect(windowsProvider.processInfoOf(-1)).toBeUndefined();
});

itWindows("commandLineOf resolves the current process command line", () => {
	expect(windowsProvider.commandLineOf(process.pid)).toContain("node");
});

itWindows("commandLineOf(-1) returns undefined", () => {
	expect(windowsProvider.commandLineOf(-1)).toBeUndefined();
});
