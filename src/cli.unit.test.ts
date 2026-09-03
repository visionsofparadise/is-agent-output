import { expect, it } from "vitest";
import { parseCliArguments, usage } from "./cli";

it("recognizes --json", () => {
	const parsed = parseCliArguments(["--json"]);

	expect(parsed).toEqual({ ok: true, options: { json: true, agents: [] } });
});

it("parses a name-only --agent value", () => {
	const parsed = parseCliArguments(["--agent", "custom:my-agent"]);

	expect(parsed.ok).toBe(true);

	if (!parsed.ok) {
		return;
	}

	expect(parsed.options.agents).toHaveLength(1);
	expect(parsed.options.agents[0]?.label).toBe("custom");
	expect(parsed.options.agents[0]?.name.test("my-agent")).toBe(true);
	expect(parsed.options.agents[0]?.commandLine).toBeUndefined();
});

it("parses --agent with a commandLine regex that may contain colons", () => {
	const parsed = parseCliArguments(["--agent", "test:node:vitest:worker"]);

	expect(parsed.ok).toBe(true);

	if (!parsed.ok) {
		return;
	}

	const pattern = parsed.options.agents[0];

	expect(pattern?.label).toBe("test");
	expect(pattern?.name.test("node")).toBe(true);
	expect(pattern?.commandLine?.test("vitest:worker")).toBe(true);
});

it("parses repeated --agent flags with --json", () => {
	const parsed = parseCliArguments(["--agent", "a:alpha", "--json", "--agent", "b:beta"]);

	expect(parsed.ok).toBe(true);

	if (!parsed.ok) {
		return;
	}

	expect(parsed.options.json).toBe(true);
	expect(parsed.options.agents.map((pattern) => pattern.label)).toEqual(["a", "b"]);
});

it("rejects a value with no colon", () => {
	const parsed = parseCliArguments(["--agent", "nocolon"]);

	expect(parsed.ok).toBe(false);

	if (parsed.ok) {
		return;
	}

	expect(parsed.usage).toContain(usage);
	expect(parsed.usage).toContain("<label>:<nameRegex>");
});

it("rejects an empty label", () => {
	const parsed = parseCliArguments(["--agent", ":name"]);

	expect(parsed.ok).toBe(false);

	if (parsed.ok) {
		return;
	}

	expect(parsed.usage).toContain("agent label is empty");
});

it("rejects --agent without a value", () => {
	const parsed = parseCliArguments(["--agent"]);

	expect(parsed.ok).toBe(false);

	if (parsed.ok) {
		return;
	}

	expect(parsed.usage).toContain("--agent requires a value");
});

it("rejects unknown flags", () => {
	const parsed = parseCliArguments(["--nope"]);

	expect(parsed.ok).toBe(false);

	if (parsed.ok) {
		return;
	}

	expect(parsed.usage).toContain("unknown flag: --nope");
});
