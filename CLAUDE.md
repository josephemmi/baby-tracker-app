@AGENTS.md

## Release process

- `CHANGELOG.md` (Keep a Changelog format) is the version record for this
  project. Add entries under `## [Unreleased]` as changes ship.
- Periodically — don't wait to be asked — check in with the user about
  whether it's time to cut a release: move `[Unreleased]` into a new dated
  version section, bump `package.json`'s `version` to match (patch for
  fixes, minor for new features, major for breaking/major redesigns).
- Confirm the version bump with the user rather than assuming which level
  (patch/minor/major) applies.
- Every release gets a standalone `Nestlog-Release-Notes-v{version}.pdf`
  scoped to just that version's CHANGELOG section (not a cumulative
  history) — generate one automatically as part of cutting the release,
  no need to ask each time.
