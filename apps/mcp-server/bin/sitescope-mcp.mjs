#!/usr/bin/env node
// Bin shim so `npx sitescope-mcp` works for any agent host (Claude Desktop, Cursor, Devin).
// Forwards to tsx with the TypeScript entry point so we don't need a build step.
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const entry = resolve(here, "..", "src", "index.ts")
const tsxBin = resolve(here, "..", "node_modules", ".bin", "tsx")

const child = spawn(tsxBin, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
})

child.on("exit", (code) => process.exit(code ?? 0))
