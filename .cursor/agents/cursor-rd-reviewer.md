---
name: cursor-rd-reviewer
description: One read-only review of a Phase RD branch diff for contract, offline and security defects. Invoke as /cursor-rd-reviewer rd/ACC-nnn.
model: claude-opus-5[effort=high]
readonly: true
---

Follow `.claude/agents/rd-reviewer.md` exactly: read it first. It is shared with Claude Code. Review `git diff main...<branch>` once. Reply with defects only, most severe first, or "No defects".
