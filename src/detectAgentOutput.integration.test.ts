import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "dist", "cli.js");
const fixtureSourcePath = join(repoRoot, "src", "intermediary.integration.fixture.mjs");
const fixtureDistPath = join(repoRoot, "dist", "intermediary.integration.fixture.mjs");
const agentFlag = "test:node:vitest";
const spawnTimeoutMs = 60_000;

const bashProbe = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" });
const hasBash = bashProbe.status === 0 && (bashProbe.stdout ?? "").includes("ok");
const itBash = hasBash ? it : it.skip;

const posixPathOf = (path: string): string => path.replaceAll("\\", "/");

const quoted = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

const nodeCommandOf = (scriptPath: string, suffix = ""): string =>
	`${quoted(posixPathOf(process.execPath))} ${quoted(posixPathOf(scriptPath))} --agent ${agentFlag}${suffix}`;

const exitCodeOf = (bashCommand: string): Promise<{ code: number; stdout: string }> =>
	new Promise((resolve, reject) => {
		const child = spawn("bash", ["-c", bashCommand], {
			cwd: repoRoot,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.on("error", reject);
		child.on("close", (code) => {
			resolve({ code: code ?? 1, stdout });
		});
	});

const ensureBuild = (): void => {
	if (existsSync(cliPath)) {
		return;
	}

	const built = spawnSync("npm", ["run", "build"], { cwd: repoRoot, encoding: "utf8", shell: true });

	if (built.status !== 0 || !existsSync(cliPath)) {
		throw new Error(`build failed: ${built.stderr}`);
	}
};

itBash(
	"returns exit 0 when bash-spawned cli stdout is captured by the test runner",
	async () => {
		ensureBuild();
		const result = await exitCodeOf(nodeCommandOf(cliPath));

		expect(result.code).toBe(0);
	},
	spawnTimeoutMs,
);

itBash(
	"returns exit 1 when the same invocation is piped to cat",
	async () => {
		ensureBuild();
		const result = await exitCodeOf(`set -o pipefail; ${nodeCommandOf(cliPath)} | cat`);

		expect(result.code).toBe(1);
	},
	spawnTimeoutMs,
);

itBash(
	"returns exit 1 when the same invocation is redirected to a file",
	async () => {
		ensureBuild();
		const directory = await mkdtemp(join(tmpdir(), "is-agent-output-"));
		const outputPath = join(directory, "out.txt");

		try {
			const result = await exitCodeOf(`${nodeCommandOf(cliPath)} > ${quoted(posixPathOf(outputPath))}`);

			expect(result.code).toBe(1);
			expect(existsSync(outputPath)).toBe(true);
			await expect(readFile(outputPath, "utf8")).resolves.toBe("");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
	spawnTimeoutMs,
);

itBash(
	"returns exit 1 when an intermediary node process captures the cli",
	async () => {
		ensureBuild();
		mkdirSync(dirname(fixtureDistPath), { recursive: true });
		copyFileSync(fixtureSourcePath, fixtureDistPath);
		const result = await exitCodeOf(
			`${quoted(posixPathOf(process.execPath))} ${quoted(posixPathOf(fixtureDistPath))}`,
		);

		expect(result.stdout.trim()).toBe("1");
	},
	spawnTimeoutMs,
);
