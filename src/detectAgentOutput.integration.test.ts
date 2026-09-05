import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const runsShell = (shell: string): boolean => {
	const probe = spawnSync(shell, ["-c", "echo ok"], { encoding: "utf8" });

	return probe.status === 0 && (probe.stdout ?? "").includes("ok");
};

const hasBash = runsShell("bash");
const itBash = hasBash ? it : it.skip;
const shells = ["bash", "sh", "dash", "zsh"].filter(runsShell);

const posixPathOf = (path: string): string => path.replaceAll("\\", "/");

const quoted = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

const nodeCommandOf = (scriptPath: string, suffix = ""): string =>
	`${quoted(posixPathOf(process.execPath))} ${quoted(posixPathOf(scriptPath))} --agent ${agentFlag}${suffix}`;

const exitCodeOf = (bashCommand: string, shell = "bash", cwd = repoRoot): Promise<{ code: number; stdout: string }> =>
	new Promise((resolve, reject) => {
		const child = spawn(shell, ["-c", bashCommand], {
			cwd,
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

const detectionOf = (json: string): { isAgentOutput: boolean; reason: string } =>
	JSON.parse(json.trim()) as { isAgentOutput: boolean; reason: string };

itBash(
	"returns false when a script file the relay names holds the redirect",
	async () => {
		ensureBuild();
		const directory = await mkdtemp(join(tmpdir(), "is-agent-output-script-"));
		const outputPath = join(directory, "out.txt");
		const scriptPath = join(directory, "redirect.sh");

		try {
			await writeFile(
				scriptPath,
				`${nodeCommandOf(cliPath, " --json")} > ${quoted(posixPathOf(outputPath))}
`,
				"utf8",
			);

			await exitCodeOf(`bash ${quoted(posixPathOf(scriptPath))}`);

			const detection = detectionOf(await readFile(outputPath, "utf8"));

			expect(detection.isAgentOutput).toBe(false);
			expect(detection.reason).toBe("unreadable script in a relay command line");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
	spawnTimeoutMs,
);

const installTimeoutMs = 300_000;

const itShell = shells.length > 0 ? it.each(shells) : it.skip.each(["no shell available"]);

itShell(
	"%s reports capture, redirect, and pipe correctly",
	async (shell: string) => {
		ensureBuild();

		const directory = await mkdtemp(join(tmpdir(), "is-agent-output-"));
		const outputPath = join(directory, "out.txt");

		try {
			const captured = await exitCodeOf(nodeCommandOf(cliPath, " --json"), shell);

			expect(detectionOf(captured.stdout).isAgentOutput).toBe(true);

			await exitCodeOf(`${nodeCommandOf(cliPath, " --json")} > ${quoted(posixPathOf(outputPath))}`, shell);

			const redirected = detectionOf(await readFile(outputPath, "utf8"));

			expect(redirected.isAgentOutput).toBe(false);

			const piped = await exitCodeOf(`${nodeCommandOf(cliPath, " --json")} | cat`, shell);

			expect(detectionOf(piped.stdout).isAgentOutput).toBe(false);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
	spawnTimeoutMs,
);

const packageRunnerDirectoryOf = async (): Promise<string> => {
	const directory = await mkdtemp(join(tmpdir(), "is-agent-output-run-"));

	await writeFile(
		join(directory, "package.json"),
		`${JSON.stringify(
			{
				name: "is-agent-output-runner-probe",
				version: "0.0.0",
				private: true,
				scripts: { probe: `node "${posixPathOf(cliPath)}" --agent ${agentFlag} --json` },
			},
			undefined,
			2,
		)}\n`,
		"utf8",
	);

	return directory;
};

itBash(
	"returns exit 0 when npm run relays the harness capture to the cli",
	async () => {
		ensureBuild();

		const directory = await packageRunnerDirectoryOf();

		try {
			const result = await exitCodeOf("npm run --silent probe", "bash", directory);

			expect(result.code).toBe(0);
			expect(detectionOf(result.stdout).isAgentOutput).toBe(true);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
	installTimeoutMs,
);

itBash(
	"returns exit 1 when the same npm run is piped to cat",
	async () => {
		ensureBuild();

		const directory = await packageRunnerDirectoryOf();

		try {
			const result = await exitCodeOf("set -o pipefail; npm run --silent probe | cat", "bash", directory);

			expect(result.code).toBe(1);

			const detection = detectionOf(result.stdout);

			expect(detection.isAgentOutput).toBe(false);
			expect(detection.reason).toMatch(/^authored stream/);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	},
	installTimeoutMs,
);
