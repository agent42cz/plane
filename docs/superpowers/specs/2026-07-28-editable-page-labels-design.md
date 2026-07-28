# Editable page labels (Plane fork)

**Date:** 2026-07-28
**Repo:** `agent42cz/plane` (fork). Branch: `feat/pages-labels-editable` (off `preview`).
**Type:** Frontend-only (`apps/web`). No Django / API changes.

## Problem

Page labels in Plane 1.3.1 can only be set at creation time via our ".md import" modal
(commits `00bb821…`). There is no way to add, change, or remove labels on an existing page,
and the read-only chips added in Feature A (`7e9fd8b7e`, `343eb766a`) sit next to the page
title. The client wants:

1. Change labels on **existing** pages (not just at import).
2. Move the label chips to the **right** of the row, next to the owner ("M") avatar.
3. Make them **clickable** — click to edit.
4. A page can carry **multiple** labels.
5. Also editable from **page settings** (inside an open page).

## Key finding — backend already supports it

`apps/api/plane/app/serializers/page.py` `PageSerializer.update()` already accepts a write-only
`labels` list: it deletes the page's existing `PageLabel` rows and bulk-creates from the new list.
So `PATCH /api/workspaces/{slug}/projects/{pid}/pages/{id}/` with `{ labels: [labelId, …] }`
persists labels. **No API/serializer change is needed** — this is purely an `apps/web` feature.

`label_ids` (read field) is what our public Pages API and the portal's Dokumenty label-filter
consume, so editing labels in Plane automatically moves a page in/out of the SPLY-filtered
Dokumenty. No portal change needed.

## Reused building blocks

- **`IssueLabelSelect`** (`apps/web/core/components/issues/select`, via `WorkItemLabelSelectBase`)
  — multi-select label dropdown. Props of interest: `value: string[]`, `onChange:(string[])=>void`,
  `projectId`, `disabled`, `label?` (custom trigger node — overrides the default trigger entirely).
  Its **default** non-empty trigger (`IssueLabelsList`) renders only a "● N Labels" **count pill**
  (names in a tooltip), which hides the tag names — so we pass a custom `label` node that renders the
  actual **named chips** (colored dot + name), matching today's "•SPLY" chip. Its click handler calls
  `stopPropagation`/`preventDefault`, so it is safe inside a clickable row. Same component the import
  modal already uses. Wrapped by a shared `PageLabelSelect` (see Design §4).
- **`page.updatePageLogo`** (`apps/web/core/store/pages/base-page.ts`) — the optimistic-update
  pattern to mirror for a new `updatePageLabels`.
- **`canCurrentUserEditPage`** — permission flag already on the page instance; gates editability.
- **`page.project_ids?.[0]`** — the project id `IssueLabelSelect` needs.

## Design

### 1. Store — `updatePageLabels(labelIds: string[])`

Add to `base-page.ts` (interface + class), mirroring `updatePageLogo`:
optimistically set `this.label_ids = labelIds`; call `this.services.update({ labels: labelIds })`
(cast as `Partial<TPage> & { labels?: string[] }`, as the import modal does); on success reconcile
`label_ids` from the response; on error revert to the previous `label_ids` and rethrow.

### 2. List row — move chips right + make editable

- `block.tsx`: remove the `appendTitleElement` read-only chip block.
- `block-item-action.tsx`: render an editable label control as the **first** element of the action
  cluster (immediately left of the owner avatar). If `canCurrentUserEditPage` →
  `<IssueLabelSelect value={label_ids ?? []} projectId={page.project_ids?.[0]}
onChange={(ids)=>page.updatePageLabels(ids)} />`. If not editable → read-only chips (reuse the
  existing chip markup) when labels exist, otherwise render nothing.

### 3. Page settings — Info panel

Add a **Labels** section to `navigation-pane/tab-panels/info/root.tsx` (a sibling of the
Document-info / Actors-info sections), using the same `IssueLabelSelect` wired to
`page.updatePageLabels`, gated on `canCurrentUserEditPage`. New component
`navigation-pane/tab-panels/info/labels-info.tsx` for parity with the existing `*-info.tsx` files.

### 4. Shared `PageLabelSelect` with named-chip trigger

Wrap `IssueLabelSelect` in `apps/web/core/components/pages/page-label-select.tsx`: resolve
`labelIds` via `useLabel().getLabelById` and pass a custom `label` node that renders **named chips**
(colored dot + name, first 2 + "+N" overflow) when non-empty, and a bordered "＋ Labels" affordance
(`LabelPropertyIcon`) when empty and editable. Returns `null` when `disabled` and empty. Both the list
row (§2) and the Info panel (§3) use this one component, so the read-only and editable states share a
single trigger appearance.

## Non-goals

- No new API endpoints, serializers, or migrations.
- No page-label management for **workspace** (non-project) pages — the label picker is
  project-scoped; the UI is wired only in project-pages contexts.
- No portal changes.

## Testing

- Pages list: click a row's label control → add/remove labels → persists (reload confirms).
- Tag `# PRD` and `Call s nákupním oddělením` as **SPLY** → they appear at
  `feedback.sply.company/dokumenty`.
- Open a page → Info panel → set labels there; verify they reflect on the list row.
- Read-only: a user without edit rights sees chips but no editor.
- `check:types --filter=web` + `check:lint --filter=web` clean.
