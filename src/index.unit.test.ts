import { expect, it } from "vitest";
import { packageName } from "./index";

it("exports the package name", () => {
	expect(packageName).toBe("is-agent-output");
});
