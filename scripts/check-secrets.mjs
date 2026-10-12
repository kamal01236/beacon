// Guard: your real keys must never reach git.
//
// Fails (exit 1) if:
//   - any .env file other than .env.example is tracked by git, or
//   - a staged change contains something that looks like an API key.
// Passes quietly otherwise. Run by `make check-secrets`, and worth wiring as a
// pre-commit hook (the Makefile `hooks` target does that).

import { execSync } from "node:child_process";

const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

let bad = false;

// 1. Tracked .env files (anything but the template).
const tracked = sh("git ls-files").split("\n").filter(Boolean);
const leakedEnv = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith(".env.example"));
if (leakedEnv.length) {
  bad = true;
  console.error("✗ These .env files are tracked by git and must not be:\n  " + leakedEnv.join("\n  "));
  console.error("  Fix: git rm --cached " + leakedEnv.join(" "));
}

// 2. Key-shaped strings in the staged diff.
const staged = sh("git diff --cached");
const KEY = /\b(sk-[A-Za-z0-9_-]{16,}|sk-proj-[A-Za-z0-9_-]{16,})\b/;
const hits = staged.split("\n").filter((l) => l.startsWith("+") && KEY.test(l));
if (hits.length) {
  bad = true;
  console.error(`✗ A staged change looks like it contains an API key (${hits.length} line(s)). Remove it before committing.`);
}

if (bad) {
  console.error("\nSecret check FAILED. Keys belong only in .env.local (gitignored).");
  process.exit(1);
}
console.log("✓ secret check passed — no .env or keys are tracked/staged");
