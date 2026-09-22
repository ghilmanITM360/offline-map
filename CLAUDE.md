# Claude operational layer

`AGENTS.md` is the shared engineering contract — read it first, it governs. This file only adds Claude-specific operating notes; it does not repeat anything AGENTS.md already says.

- Load a relevant Skill before starting a task it covers (systematic-debugging for bugs, brainstorming before creative/design work, etc.) instead of improvising a process the skill already owns.
- For large read-heavy audits (branch forensics, multi-file doc/asset inventories), fork a subagent to do the raw digging and return a distilled report — keep raw diff/log/grep output out of the main conversation.
- Destructive or hard-to-reverse actions (force-deleting branches, deleting tracked files, merging PRs, pushing to remote) get a brief confirmation unless the user has already pre-authorized that specific class of action in the current task.
- Use `docs/PROJECT_STATUS.md` for current snapshot facts (test totals, open issues, build state) — never hardcode those into this file or AGENTS.md.
