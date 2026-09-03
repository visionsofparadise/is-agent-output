import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = join(dirname(fileURLToPath(import.meta.url)), "cli.js");
const child = spawn(process.execPath, [cliPath, "--agent", "test:node:vitest"], {
	stdio: ["ignore", "pipe", "pipe"],
});

child.on("close", (code) => {
	process.stdout.write(String(code ?? 1));
});
