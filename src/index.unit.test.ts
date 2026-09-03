import { expect, it } from "vitest";
import { providerOf } from "./index";

it("providerOf returns a provider for the current platform", () => {
	const provider = providerOf();

	if (process.platform === "win32" || process.platform === "linux") {
		const info = provider.processInfoOf(process.pid);

		expect(info).toBeDefined();
		expect(info?.name).toContain("node");

		return;
	}

	expect(provider.processInfoOf(process.pid)).toBeUndefined();
	expect(provider.stdoutSinkOf()).toEqual({ kind: "unknown" });
});
