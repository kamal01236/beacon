// Build wrapper so ONE codebase serves two targets:
//   - default (server): `next build` with the /api route handlers (the agent).
//   - BUILD_TARGET=pages: the static export for GitHub Pages, which cannot
//     contain dynamic route handlers. We move app/api aside for the duration of
//     the export build and always restore it, so the live Pages deploy keeps
//     working untouched while the server build keeps the backend.
//
// On Linux/CI we rename the whole app/api directory (fast, atomic — this is what
// the GitHub Actions workflow does). On Windows an editor/file-watcher often
// holds a handle on app/api so that rename fails with EPERM; there we fall back
// to moving the directory's CHILDREN into .api.hidden (which Windows permits),
// leaving app/api empty — equally route-handler-free for the export.
//
// Invoked by `npm run build` (the GitHub Actions workflow runs exactly that).

import { spawnSync } from "node:child_process";
import { existsSync, renameSync, cpSync, rmSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = join(root, "app", "api");
const HIDDEN = join(root, ".api.hidden");
const isPages = process.env.BUILD_TARGET === "pages";

const walkFiles = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walkFiles(p) : [p];
  });

function hide() {
  if (!existsSync(API)) return;
  try {
    renameSync(API, HIDDEN); // whole-dir move (Linux/CI, and Windows when free)
  } catch (err) {
    if (err.code !== "EPERM" && err.code !== "EBUSY" && err.code !== "EACCES") throw err;
    // Windows holds app/api (and its subdirs) open, so neither the dir nor its
    // subdirs can be renamed. Single-file delete IS permitted: back the tree up
    // by copy, then delete just the route files, leaving empty dirs behind —
    // which Next collects as zero route handlers, exactly what the export needs.
    cpSync(API, HIDDEN, { recursive: true });
    for (const f of walkFiles(API)) rmSync(f);
  }
}

function restore() {
  if (!existsSync(HIDDEN)) return;
  if (!existsSync(API)) {
    renameSync(HIDDEN, API); // whole-dir rename case
    return;
  }
  // copy-backup case: app/api still exists (route files deleted) — copy them back.
  cpSync(HIDDEN, API, { recursive: true, force: true });
  rmSync(HIDDEN, { recursive: true, force: true });
}

// Recover from an interrupted earlier run, then run the build.
restore();
if (isPages) hide();

try {
  const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: true, cwd: root });
  process.exitCode = r.status ?? 1;
} finally {
  restore();
}
