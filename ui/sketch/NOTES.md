# Sketch review record (task 1.2)

Source: stakeholder-authored `nozzle_ workflow console.html`, adopted verbatim as
`ui/sketch/index.html` on 2026-10-16. Verified: HTML parses, JS `node --check`
passes, serves HTTP 200 with no build step.

## Decision: ACCEPTED as the UX direction reference [accepted]

The file is the approved layout/navigation reference for the `web-console`
capability. The final TanStack Start SPA (tasks 7.x) follows its structure:
sidebar sections, workflow list → workflow view owning its runs, run graph with
per-attempt logs, workers view, role-aware controls.

## Scope notes (each marked)

- [accepted] Light/dark theme via `prefers-color-scheme`, Inter + JetBrains Mono,
  responsive breakpoints, focus-visible outlines, reduced-motion handling.
- [accepted] Workflow versions with activate/roll-back, version diff text,
  per-run version pin — maps to `workflow-bundles` version pinning.
- [accepted] Per-attempt expandable logs, retry/failure event feed, pool usage
  meters — maps to `run-observability` + `task-scheduling` attempt tracking.
- [deferred] Approval gates (`approve_*` tasks, Approvals section, quorum,
  "cannot approve own run") — human approval workflows are NOT in MVP scope.
  The predicate-branch `skipped` model in `task-scheduling` covers the MVP
  branch/skip UI states; gate UI stays mock-only until a later change.
- [deferred] Roles/RBAC (viewer/operator/approver/admin, Access section,
  permission matrix) — MVP has no in-app auth; Cloudflare Access is the
  boundary. Role switching in the sketch is demo-only.
- [deferred] Cron schedules, pause/resume, backfill — MVP is manual triggers only.
- [deferred] Multi-executor pools per task (Lambda/ECS/K8s/CF in one workflow)
  and Secrets/audit-log sections — MVP is monolingual, co-located pairs,
  no cross-language edges; secrets/audit are later changes.
- [rejected] Nothing rejected; deferred items remain candidates for follow-up
  changes, not removals from the vision.

## Verification

Every note above carries an accept/defer/reject mark. Sketch file verified
serving 200 with no build step. Core engine work (tasks 2.x onward) unblocked.
