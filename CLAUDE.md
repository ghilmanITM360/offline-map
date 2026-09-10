# Karachi Ijtema Offline Navigation

## Product

Offline-first pedestrian navigation for Karachi Ijtema: find a destination, route, navigate, arrive.
Current architecture/source overrides stale reports. Read `AGENTS.md` for detailed architecture, official coordinates, MVVM ownership, and validation commands.
Keep one map-first `HomeScreen` and one shared `MapView`; directions, preview, navigation, and arrival are map modes/overlays.

## Evidence Priority

Use evidence in this order: current runtime; current repository/source; current automated tests; current project documentation; previous reports/handoffs; model memory.
Never present assumptions as confirmed. Label findings with: RUNTIME VERIFIED, TEST VERIFIED, CODE-LEVEL ONLY, FIELD-BLOCKED, ENVIRONMENT-BLOCKED, or NOT VERIFIED.
Tests are not runtime verification. Record the tested commit and environment; do not transfer another branch's results to the current HEAD.

## Engineering Discipline

For non-trivial work: inspect, identify the exact problem, plan, identify the two biggest risks, then execute.
For bugs: REPRODUCE, ROOT CAUSE, RED TEST where practical, MINIMAL FIX, GREEN, then RUNTIME RECHECK where applicable.
Inspect callers and fix the shared root cause. Do not shotgun-debug; after three unsuccessful fix attempts, stop patching and return to investigation.
Production behavior matters more than passing tests. Architecture, edge cases, integrations, failure recovery, security, maintainability, and ownership remain mandatory for AI-generated code.

## Ownership / Maintainability

After significant changes, explain concisely: OWNER; WHY THIS MODULE; FAILURE RECOVERY; MAINTAINABILITY IMPACT.
Do not create code nobody can explain or own. Reuse existing helpers, standard libraries, and installed dependencies before adding abstractions.
Views render and forward actions; ViewModels own route lifecycle and stale-result handling; services own routing policy. Follow the detailed ownership boundaries in `AGENTS.md`.

## Scope Discipline

Keep one primary concern per task. Do not mix UI, routing, GPS, security, Git cleanup, documentation, or map-renderer migration unless explicitly required.
Do not perform opportunistic refactors or create speculative infrastructure.

## Dependencies

Inspect current versions first. Add, update, or downgrade dependencies only with evidence and a task need.
Do not perform broad package upgrades while fixing an unrelated bug.

## GIS / Routing Safety

Never invent gate coordinates, road geometry, graph connectors, or survey evidence.
Missing field data remains FIELD-BLOCKED and fails closed. Never make unsafe routing green to satisfy tests.
Preserve routing V2 contracts unless explicitly changed: inside coordinates use internal pedestrian routing; every outside coordinate uses the same policy regardless of GPS/search/map/remembered origin.
Outside flow: `prepareOutsideRoutingPlan`, configured Google walking-route proxy, bundled OSM fallback, labelled direct-direction guide, `finalizeOutsideRoutingPlan`.
Core selects the complete journey using outside route + gate connector + gate penalty + internal route; manual gate selection remains authoritative. Providers supply outside candidates only.
Keep provider order and complete-route cost out of Views/ViewModels. Direct guides must not claim road navigation.

## Offline-First Product Rule

Internet or Google basemap availability must not own destination data, internal routing, GPS, instructions, ETA, rerouting, or arrival.
Internal routing and bundled OSM fallback remain offline. Future renderer migrations must preserve the existing navigation domain unless explicitly approved.

## Security

Never commit or print `.env`, `.env.local`, API keys, keystores, passwords, tokens, local signing properties, private signing material, or secret-bearing logs.
For historically exposed credentials, report ROTATION VERIFIED or ROTATION UNKNOWN — OWNER ACTION REQUIRED. Never guess Cloud state.
Mobile routing configuration may contain only the proxy base URL, never Google Routes credentials, proxy signing secrets, or privileged bearer tokens, including in `EXPO_PUBLIC_*`.
Maps SDK rendering keys are separate client-visible credentials: restrict by platform/application and never reuse them for Google Routes.
Keep security review a separate focused pass at milestones.

## Git

Before substantial work, verify repository, worktree, branch, HEAD, dirty state, upstream, and relevant PR from current Git evidence.
Use one isolated branch/worktree per task; verify source ref, target branch/path, and worktree list before creation. Never implement in a dirty integration worktree.
Stage explicit paths; use focused commits with one concern where practical. Exclude generated files and unrelated changes.
Never auto-merge. Push, merge, rebase, reset, clean, and destructive operations require owner approval.
Never delete branches/worktrees merely because they look old: prove merged, superseded, or intentionally abandoned, then obtain owner approval.
Never push broken or incomplete work because session usage is ending. Usage thresholds do not authorize commits or pushes.

## Skills

Before non-trivial work, inspect installed project/global skill listings and load only task-relevant skills.
Explicitly skip irrelevant skills when this saves context. Install skills only for a real capability gap.
Work directly by default. Use subagents only for two or more genuinely independent parallel investigations, or when isolated context materially protects the main context.
Do not default to subagents for one-file fixes, sequential debugging, simple search, emulator driving, routine tests, or small documentation edits.

## Token / Context Efficiency

Keep output concise unless detail is requested. Prefer targeted reads, diffs, focused excerpts, and change summaries over full-file output.
Do not reread, paste, or repeat context already in this file or `docs/CURRENT_HANDOFF.md` without need.
Use relevant error/stack sections instead of giant unrelated logs.
Test progressively: focused failing test, focused related suite, relevant integration gate, then the full suite once at an appropriate milestone.
Do not repeatedly run the full suite during development or rerun proven checks without new changes, failures, or unresolved concerns.

## Usage Guard

Before substantial multi-step work, check usage when available through Claude Code's current facilities (`/usage`). If unavailable, say so; do not invent percentages.
Session usage: at >=75%, prepare a checkpoint; at >=85%, finish only coherent current work and commit/push only when verified and authorized; at >=90%, start no new work, update the handoff, and stop.
Weekly usage: at >=90%, avoid broad multi-hour work; at >=93%, start only narrow, high-value tasks; at >=97%, start no new investigation and only hand off or finish verified work.
Do not spend remaining allowance rerunning already-proven work without need.

## Planning

Plan before non-trivial implementation. Normally include only files, approach, risks, tests, and acceptance criteria.
Small obvious fixes may skip a formal plan. Do not produce giant essays unless requested.

## Definition of Done

Every task needs explicit acceptance criteria; done means those criteria have evidence. Mark untested required items NOT VERIFIED; never silently downgrade requirements.
Run the applicable validation commands in `AGENTS.md` before handoff, unless the task explicitly limits validation (for example, documentation-only work with no app tests).
Report exact commands, pass/fail counts, warnings, unverified runtime boundaries, final HEAD, and Git status.
Do not claim Android, iOS, physical-device, deployed-proxy, or real Google Routes verification without testing that exact environment.
After integration, ignore old APKs: build a fresh release APK from the intended final commit and record commit, build command, timestamp, and checksum before device testing.

## Session Handoff

After substantial work, update `docs/CURRENT_HANDOFF.md` with current actionable state only: repository/worktree, branch/HEAD, PR, completed work, changed files, tests, runtime evidence, open defects, external/field blockers, remaining work, exactly one next action, and verdict.
Replace stale state rather than appending a diary. Git history and PRs already preserve history.
Keep permanent rules here and changing state in the handoff. Avoid additional workflow/status/history files unless an existing convention requires one.

## Future Prompt Contract

1. Read `CLAUDE.md` and its referenced project rules.
2. Read `docs/CURRENT_HANDOFF.md`, then recheck Git evidence before relying on its snapshot.
3. Inspect only task-relevant source.
4. Execute the requested narrow task.
5. Update the handoff when material state changes.

Future prompts may intentionally be short. Do not ask the user to repeat context already stored in these files.

## Claude Code Session Guidance

Use `/compact` when the same task becomes long; use `/clear` for a new unrelated task after saving the handoff.
Use `/usage` for allowance and `/context` for context breakdown. These are operator commands, not project-code automation; never invoke `/clear` automatically.
Do not store command output in this file.
