#!/bin/bash
set -euo pipefail

# Claude Code on the web runs each session in a fresh container whose global
# git identity is the Anthropic bot (Claude <noreply@anthropic.com>), with
# commit signing. Left as-is, every commit made from a web session gets
# authored as the bot instead of the repo owner, and GitHub silently excludes
# those commits from the owner's contribution graph (author email must match
# a verified email on the account). Overriding the identity locally in this
# clone's .git/config — not the container's global config — fixes commits
# made from this session without touching how other repos/sessions behave.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

git config user.name "Joseph Emmi"
git config user.email "josephemmi@gmail.com"
