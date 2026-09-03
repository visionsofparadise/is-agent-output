import { expect, it } from "vitest";
import { providerOf } from "./index";

it("providerOf returns a provider for the current platform", () => {
	const provider = providerOf();
	const info = provider.processInfoOf(process.pid);

	expect(info).toBeDefined();
	expect(info?.name).toContain("node");
});
