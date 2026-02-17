# Version 1.2.2 Release Notes

Release date: 2026-02-18

This patch release fixes authentication/org-context bugs, improves template sending UX (variable support), and enhances the Templates page for mobile users.

## Highlights

- Fix: resolve org context for regular users during auth — prevents 400 errors when fetching conversations/templates (root cause: empty orgId JWT entries).
- Fix: reject logins for accounts missing an org assignment (clear error message instead of producing invalid JWT).
- Feature: Template sending — per-variable inputs in the message composer and strict client/server validation for template parameter counts.
- Feature: Templates page — mobile-friendly card layout, status filter, and expandable previews for long template bodies.
- Improvement: Client-side retry logic for early startup timing issues when org context is not yet available.
- Misc: UI polish and logging improvements for easier debugging.

## Migration / Upgrade Notes

- No new database migrations are required for this release.
- Recommended: restart backend (`services/api`) and desktop app after upgrading.

## Files changed (not exhaustive)

- apps/desktop: MessageInput UI + Templates page mobile improvements
- services/api: auth middleware, messageService template validation, templates routes

## How to upgrade

1. Pull latest changes
2. From `services/api`: `npm ci && npm run migrate && npm run build`
3. From `apps/desktop`: `npm ci && npm run build`
4. Restart services / desktop app

---

Thank you — report any regressions or issues in the issue tracker.