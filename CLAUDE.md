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
  no need to ask each time. Use `scripts/generate-release-notes.py
  <version> CHANGELOG.md <out_path>` (requires `reportlab`) rather than
  writing this from scratch.
- Do not upload the PDF to Google Drive. Generate it and hand it to the
  user directly (send the file); they handle getting it into Drive
  themselves. This was tried the other way (auto-upload via Drive tools)
  and cost far more effort than it was worth for a one-page PDF — don't
  revisit that regardless of what tooling becomes available later.
