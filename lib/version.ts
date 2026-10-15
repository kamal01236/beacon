// Build identity, for /api/health and the footer of a bug report.
//
// Every value is injected at build time (next.config.mjs reads them from the
// environment), because a deployed bundle cannot read package.json or run git.
// Locally they are "dev"/"unknown", which is itself useful information: it says
// this is not a released build.

export const VERSION = {
  /** package.json version at build time. */
  version: process.env.NEXT_PUBLIC_BEACON_VERSION || "0.0.0-dev",
  /** Short commit SHA, when the build had one (CI sets it). */
  commit: process.env.NEXT_PUBLIC_BEACON_COMMIT || "unknown",
  /** ISO timestamp of the build. */
  builtAt: process.env.NEXT_PUBLIC_BEACON_BUILT_AT || "unknown",
  /** "server" for the full app, "pages" for the static export. */
  target: process.env.NEXT_PUBLIC_BEACON_TARGET || "server",
} as const;

/** One line for a footer or a log banner. */
export const versionLine = (): string => `beacon ${VERSION.version} (${VERSION.commit}, ${VERSION.target})`;
