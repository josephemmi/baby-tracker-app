---
name: retro
description: Run a short retrospective at the end of a meaningful unit of work — closing or transitioning a ticket (Linear, Jira, GitHub Issues), merging or opening a pull request for merge, cutting a release, or a natural stopping point after a multi-step task. Surfaces process/tooling/workflow friction (confusing conventions, missing docs, manual steps that should be automated) even when it never came up in conversation, AND — for any ongoing codebase or project — appends an entry to that project's running progress log (what got done, what's in flight, what's next), creating that log on first use if none exists, so the next session doesn't start cold. Trigger proactively whenever such a milestone is reached; don't wait to be asked. Also invoke when the user asks for a retro, a wrap-up, a process check, or types /retro. Do NOT use for routine small edits, mid-task check-ins, or when no real unit of work has concluded — it's a closing ritual, not running commentary, and it can validly conclude "nothing to flag."
---

# Retro

A short look-back at the end of a piece of work, aimed at the *process*
around the work rather than the work itself: things that were confusing,
manual, undocumented, or would trip up the next session the same way they
just tripped up this one.

## Why this exists

Two related gaps this closes:

1. Useful lessons surface constantly while doing real work — "there's no
   PR template," "the production branch has a confusing name," "I had to
   re-explain this workflow from scratch" — but they only get acted on if
   they happen to come up in conversation. This skill makes that check
   deliberate instead of incidental.
2. On any project with continuity — an app, a codebase, anything that
   spans more than one session — context about what happened and what's
   next otherwise lives only in that one conversation. The next session
   (whoever runs it) starts cold unless something durable captures it.
   This skill keeps that record current.

## When to run this

Run it right after a natural stopping point, not on a timer and not mid-task:

- A ticket just got closed, moved to review, or otherwise resolved
- A PR just got opened for merge, or just got merged
- A release just got cut
- The user says something like "what's next," "we're done here," "good
  session," or otherwise signals the current thread of work is wrapping up
- The user explicitly asks for a retro, a wrap-up, or types `/retro`

Don't run it after small, self-contained edits, or in the middle of a
multi-step task that's still clearly in progress — it's a closing step,
not a running commentary. If several of these milestones happen in quick
succession in one session, one retro covering all of them is enough; don't
repeat it for each.

## Step 1: Look back over what just happened

Reconstruct the unit of work that just concluded — this session's own
context is the main source, supplemented by `git log`/`git diff` if code
was involved. Look specifically for:

- **Friction you had to work around.** Anything you had to figure out by
  trial and error, ask the user to clarify, or improvise a workaround for
  — a missing convention, an undocumented gotcha, a tool that didn't do
  what its description implied.
- **Manual steps that felt like they should be automated.** Anything you
  or the user did by hand more than once, or that has an obvious
  mechanical fix (a template, a script, a hook, a config default).
  Steps that are inherently manual (things that need judgment, or
  need a human before something goes live) don't count — biggest tell
  is inherent judgement vs. rote repetition.
- **Things a future session would hit again.** If nothing changes, would
  the next person (human or Claude) doing similar work run into the exact
  same confusion or have the exact same conversation? If yes, that's a
  candidate finding regardless of how the current session resolved it.
- **Whether it's already covered.** Check the project's `CLAUDE.md` /
  `AGENTS.md` (or equivalent) before treating something as a finding — if
  it's already written down and you simply hadn't read it, that's not a
  process gap, and doesn't belong in the list.

This is a quick scan, not an audit — a couple of minutes of thinking back
over the session, not a fresh investigation into the whole codebase.

## Step 2: Compile candidate findings

For each real candidate, frame it in three parts:

- **What happened** — the concrete moment (e.g. "had to explain the
  branch/PR/merge flow from scratch because nothing documented it").
- **Why it's friction** — what it cost (time, confusion, risk of doing it
  wrong) and why it'll recur if untouched.
- **What a fix would look like** — concrete enough to act on, not vague
  ("write X down in CLAUDE.md," not "improve documentation").

Drop anything trivial, anything that's a one-off that won't recur, and
anything already covered by existing docs. If nothing survives this
filter, say so in a sentence or two and stop here — a clean "nothing to
flag this time" is a completely fine outcome and shouldn't be padded out
to look more substantial than it is.

## Step 3: Present findings and decide together

Bring the list to the user conversationally — not a formal report, a
short rundown. For each finding, ask what they want to do with it:

1. **Fix it now** — a small, safe, doc/config-only change (a CLAUDE.md
   note, a template file, a settings tweak). Make it directly, using the
   same judgment about risky/hard-to-reverse/shared-impact actions that
   governs everything else — most retro findings are low-risk docs
   changes, but treat anything touching shared state or production
   configuration with the same care it would get outside a retro.
2. **File it for later** — when it needs real work, a design decision, or
   just isn't urgent. Use whatever issue tracker and team/project this
   codebase already uses (check `CLAUDE.md`/`AGENTS.md` for a "work
   tracking" convention first); if there's genuinely no existing
   convention, ask which tracker before creating anything rather than
   guessing.
3. **Drop it** — not worth acting on. That's a legitimate answer; don't
   push back on it.

Don't batch this into one big wall of text if there are several findings
— list them briefly, then let the conversation sort out what happens to
each, the same way you'd work through any short list of options with the
user.

## Step 4: Update the project's running log

Separate from the friction findings above — this runs whenever real work
happened, even if Steps 2-3 turned up nothing to flag, because its job is
progress, not just problems.

- Only applies to an ongoing codebase or project — something with a
  "next session" to hand off to. Skip it entirely for a one-off question,
  a piece of writing, or any task with no continuity to preserve.
- Check whether the project already keeps a log like this before
  assuming it doesn't — look for something referenced from `CLAUDE.md`/
  `AGENTS.md` (an `@`-imported file is the strongest signal), or a file
  clearly serving this purpose already even under a different name. Don't
  confuse it with a user-facing changelog or a technical gotchas list —
  this is specifically the "what happened, what's open, what's next"
  narrative.
- If one exists, add a new entry at the top (reverse-chronological, most
  recent first) in whatever format it already uses: what got done (with
  ticket/PR links where they exist), what's still in flight or open, and
  anything worth flagging for whoever picks this up next. Keep the entry
  proportional to the work — a small session gets a few lines, not an
  essay.
- If none exists, propose creating one — a plain markdown file (e.g.
  `PROJECT_LOG.md` at the repo root is a reasonable default), imported
  into every session the same way `CLAUDE.md` already imports other files
  (like `AGENTS.md`), seeded with the current session so it's useful
  immediately rather than empty. Ask once where they'd like it, or
  confirm the default; once it exists and is referenced, don't ask again
  on future runs — just use it.

## Step 5: Act, then stop

Apply whatever was decided in Step 3, and make the log entry from Step 4
— then confirm briefly what happened to each finding, and stop. This is
meant to close out the work that already happened, not spawn a new
project of its own; if a finding turns out to be bigger than expected
once you start on it, that's itself a sign it belongs in "file it for
later," not in the retro itself.
