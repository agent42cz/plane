# Editable Page Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add/change/remove labels on existing Plane pages — from the Pages list row (next to the owner avatar) and from the open page's Info panel.

**Architecture:** Frontend-only in `apps/web`. The app API's `PageSerializer.update` already persists a write-only `labels` list, so we add a store action `updatePageLabels` that PATCHes `{ labels }`, then reuse the existing `IssueLabelSelect` multi-select in two places. No Django/API/migration changes.

**Tech Stack:** TypeScript, React 19, MobX (`mobx-react`), Plane monorepo (pnpm + turbo).

## Global Constraints

- **No backend changes.** Do not touch `apps/api`, serializers, or migrations. Backend label update already works.
- **Reuse `IssueLabelSelect`** from `@/components/issues/select` (multi-select, project-scoped, chips-or-button trigger, self-`stopPropagation`s). Do not build a new picker.
- **Gate editing on `canCurrentUserEditPage`** (already on the page instance).
- **Verification gate = type-check + lint** (the fork web app has no component unit-test harness; this matches Features A/#2). Per task, from repo root `/home/dev/plane`:
  - `npx turbo run check:types --filter=web`
  - `npx turbo run check:lint --filter=web`
  - Both must be clean (0 errors) before commit. A bare `pnpm --filter web check:types` can fail on a missing-dist quirk — use `turbo` so `^build` deps run first.
- **Branch:** `feat/pages-labels-editable` (already created off `preview`).
- **Written output in English** (labels, comments).

---

### Task 1: Store action `updatePageLabels`

**Files:**

- Modify: `apps/web/core/store/pages/base-page.ts` (interface method decl ~line 40; `makeObservable` actions block ~line 185; new class method next to `updatePageLogo` ~line 454)

**Interfaces:**

- Produces: `page.updatePageLabels(labelIds: string[]): Promise<void>` on every page instance (`TPageInstance`). Optimistically sets `label_ids`, PATCHes `{ labels: labelIds }`, reconciles `label_ids` from the response, reverts on error. Consumed by Tasks 2 and 3.
- Consumes (existing): `this.services.update(payload: Partial<TPage>): Promise<Partial<TPage>>`, `this.label_ids: string[] | undefined`, `runInAction`.

- [ ] **Step 1: Add the interface method declaration**

In `base-page.ts`, in the page interface, immediately after the `updatePageLogo` line:

```ts
updatePageLogo: (value: TChangeHandlerProps) => Promise<void>;
updatePageLabels: (labelIds: string[]) => Promise<void>;
```

- [ ] **Step 2: Register the action in `makeObservable`**

In the `makeObservable(this, { ... })` actions block, immediately after `updatePageLogo: action,`:

```ts
      updatePageLogo: action,
      updatePageLabels: action,
```

- [ ] **Step 3: Implement the method**

Add directly below the `updatePageLogo = async (...) => { ... };` class field:

```ts
updatePageLabels = async (labelIds: string[]) => {
  const previousLabelIds = this.label_ids ? [...this.label_ids] : undefined;
  try {
    runInAction(() => {
      this.label_ids = labelIds;
    });
    // `labels` is a write-only field on PageSerializer; TPage only exposes `label_ids`.
    const response = await this.services.update({ labels: labelIds } as unknown as Partial<TPage>);
    if (response?.label_ids) {
      runInAction(() => {
        this.label_ids = response.label_ids;
      });
    }
  } catch (error) {
    console.error("Error in updating page labels", error);
    runInAction(() => {
      this.label_ids = previousLabelIds;
    });
    throw error;
  }
};
```

- [ ] **Step 4: Type-check**

Run: `cd /home/dev/plane && npx turbo run check:types --filter=web`
Expected: PASS (0 errors).

- [ ] **Step 5: Lint**

Run: `cd /home/dev/plane && npx turbo run check:lint --filter=web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/plane
git add apps/web/core/store/pages/base-page.ts
git commit -m "feat(pages): add updatePageLabels store action"
```

---

### Task 2: List row — move label chips right, make them editable

**Files:**

- Modify: `apps/web/core/components/pages/list/block.tsx` (remove title-side chips)
- Modify: `apps/web/core/components/pages/list/block-item-action.tsx` (add editable control before the owner avatar)

**Interfaces:**

- Consumes: `page.updatePageLabels` (Task 1); `IssueLabelSelect` from `@/components/issues/select`; `useLabel().getLabelById`; page fields `label_ids`, `project_ids`, `canCurrentUserEditPage`.

- [ ] **Step 1: Remove the read-only chips from `block.tsx`**

In `apps/web/core/components/pages/list/block.tsx`:

1. Delete the import `import { useLabel } from "@/hooks/store/use-label";`.
2. Delete `const { getLabelById } = useLabel();`.
3. Delete the `const pageLabels = (label_ids ?? []).map(...)` line, and drop `label_ids` from the destructure `const { name, logo_props, label_ids, getRedirectionLink } = page;` → `const { name, logo_props, getRedirectionLink } = page;`.
4. Delete the entire `appendTitleElement={ ... }` prop from `<ListItem>`.

The resulting `<ListItem>` has no `appendTitleElement`; `title`, `prependTitleElement`, `itemLink`, `actionableItems`, etc. stay unchanged.

- [ ] **Step 2: Add the editable control to `block-item-action.tsx`**

In `apps/web/core/components/pages/list/block-item-action.tsx`:

Add imports (with the other `@/` imports):

```ts
import { IssueLabelSelect } from "@/components/issues/select";
import { useLabel } from "@/hooks/store/use-label";
```

In the component body, add the label hook next to `useMember`:

```ts
const { getUserDetails } = useMember();
const { getLabelById } = useLabel();
```

Extend the derived-values destructure and add `projectId`:

```ts
const {
  access,
  created_at,
  is_favorite,
  owned_by,
  canCurrentUserFavoritePage,
  canCurrentUserEditPage,
  label_ids,
  project_ids,
} = page;
const ownerDetails = owned_by ? getUserDetails(owned_by) : undefined;
const projectId = project_ids?.[0];
```

Insert this block as the FIRST child of the returned fragment, immediately before the `{/* page details */}` owner-avatar block:

```tsx
{
  /* labels — editable for members, read-only chips otherwise */
}
{
  canCurrentUserEditPage ? (
    <IssueLabelSelect
      value={label_ids ?? []}
      projectId={projectId}
      onChange={(labelIds) => page.updatePageLabels(labelIds)}
    />
  ) : label_ids && label_ids.length > 0 ? (
    <span className="flex flex-shrink-0 items-center gap-1">
      {label_ids
        .map((labelId) => getLabelById(labelId))
        .filter((label) => !!label)
        .map((label) => (
          <span
            key={label.id}
            className="flex items-center gap-1 rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-tertiary"
          >
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
            <span className="normal-case">{label.name}</span>
          </span>
        ))}
    </span>
  ) : null;
}
```

- [ ] **Step 3: Type-check**

Run: `cd /home/dev/plane && npx turbo run check:types --filter=web`
Expected: PASS (0 errors). If `label` is flagged as possibly-null in the read-only `.map`, note the identical pattern already passed type-check in the original `block.tsx` — keep it verbatim.

- [ ] **Step 4: Lint**

Run: `cd /home/dev/plane && npx turbo run check:lint --filter=web`
Expected: PASS.

- [ ] **Step 5: Manual behavioral check (describe, not required to run)**

On the Pages list, the label chips now render at the right of the row, immediately left of the owner avatar. Clicking them (or the "Labels" button when empty) opens a searchable multi-select; it does NOT navigate into the page (the picker `stopPropagation`s). Selecting/deselecting calls `updatePageLabels`.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/plane
git add apps/web/core/components/pages/list/block.tsx apps/web/core/components/pages/list/block-item-action.tsx
git commit -m "feat(pages): editable labels on list row, moved next to owner avatar"
```

---

### Task 3: Page settings — Labels section in the Info panel

**Files:**

- Create: `apps/web/core/components/pages/navigation-pane/tab-panels/info/labels-info.tsx`
- Modify: `apps/web/core/components/pages/navigation-pane/tab-panels/info/root.tsx`

**Interfaces:**

- Consumes: `page.updatePageLabels` (Task 1); `IssueLabelSelect`; page fields `label_ids`, `project_ids`, `canCurrentUserEditPage`.
- Produces: `PageNavigationPaneInfoTabLabelsInfo` component, rendered inside the Info tab.

- [ ] **Step 1: Create `labels-info.tsx`**

```tsx
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { IssueLabelSelect } from "@/components/issues/select";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
};

export const PageNavigationPaneInfoTabLabelsInfo = observer(function PageNavigationPaneInfoTabLabelsInfo(props: Props) {
  const { page } = props;
  // derived values
  const { label_ids, project_ids, canCurrentUserEditPage } = page;
  const projectId = project_ids?.[0];
  // nothing to show for a read-only viewer with no labels
  if (!canCurrentUserEditPage && (!label_ids || label_ids.length === 0)) return null;

  return (
    <div className="mt-4">
      <p className="text-11 font-medium text-tertiary">Labels</p>
      <div className="mt-2">
        <IssueLabelSelect
          value={label_ids ?? []}
          projectId={projectId}
          onChange={(labelIds) => page.updatePageLabels(labelIds)}
          disabled={!canCurrentUserEditPage}
        />
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Render it in `root.tsx`**

In `apps/web/core/components/pages/navigation-pane/tab-panels/info/root.tsx`:

1. Add the import with the other `./` local imports:

```ts
import { PageNavigationPaneInfoTabActorsInfo } from "./actors-info";
import { PageNavigationPaneInfoTabDocumentInfo } from "./document-info";
import { PageNavigationPaneInfoTabLabelsInfo } from "./labels-info";
import { PageNavigationPaneInfoTabVersionHistory } from "./version-history";
```

2. Render it between Document-info and Actors-info:

```tsx
        <PageNavigationPaneInfoTabDocumentInfo page={page} />
        <PageNavigationPaneInfoTabLabelsInfo page={page} />
        <PageNavigationPaneInfoTabActorsInfo page={page} />
```

- [ ] **Step 3: Type-check**

Run: `cd /home/dev/plane && npx turbo run check:types --filter=web`
Expected: PASS (0 errors).

- [ ] **Step 4: Lint**

Run: `cd /home/dev/plane && npx turbo run check:lint --filter=web`
Expected: PASS.

- [ ] **Step 5: Manual behavioral check (describe, not required to run)**

Open a page → open the navigation-pane Info tab → a "Labels" section shows between the document stats and "Edited by", with the same multi-select. Editing there updates the same `label_ids` that the list row reflects.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/plane
git add apps/web/core/components/pages/navigation-pane/tab-panels/info/labels-info.tsx apps/web/core/components/pages/navigation-pane/tab-panels/info/root.tsx
git commit -m "feat(pages): Labels section in page Info panel"
```

---

### Task 4: Named-chip trigger — shared `PageLabelSelect`

**Why:** The default `IssueLabelSelect` trigger renders a "● N Labels" count pill (names hidden in a tooltip). The requirement is to SEE the tag names on the row. Wrap it in a shared component with a custom `label` node that renders named chips, and use it from both the list row and the Info panel.

**Files:**

- Create: `apps/web/core/components/pages/page-label-select.tsx`
- Modify: `apps/web/core/components/pages/list/block-item-action.tsx` (use the wrapper, drop now-unused imports)
- Modify: `apps/web/core/components/pages/navigation-pane/tab-panels/info/labels-info.tsx` (use the wrapper)

**Interfaces:**

- Produces: `PageLabelSelect({ labelIds: string[]; projectId: string | undefined; onChange: (labelIds: string[]) => void; disabled?: boolean })`. Renders named chips (first 2 + "+N") when non-empty, a "＋ Labels" affordance when empty+editable, and `null` when `disabled` and empty.
- Consumes: `IssueLabelSelect` (`@/components/issues/select`), `useLabel().getLabelById`, `LabelPropertyIcon` (`@plane/propel/icons`).

- [ ] **Step 1: Create `page-label-select.tsx`**

```tsx
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { LabelPropertyIcon } from "@plane/propel/icons";
// components
import { IssueLabelSelect } from "@/components/issues/select";
// hooks
import { useLabel } from "@/hooks/store/use-label";

type Props = {
  labelIds: string[];
  projectId: string | undefined;
  onChange: (labelIds: string[]) => void;
  disabled?: boolean;
};

export const PageLabelSelect = observer(function PageLabelSelect(props: Props) {
  const { labelIds, projectId, onChange, disabled = false } = props;
  // store hooks
  const { getLabelById } = useLabel();
  // derived values
  const labels = labelIds.map((labelId) => getLabelById(labelId)).filter((label) => !!label);
  // read-only viewer with no labels: render nothing
  if (disabled && labels.length === 0) return null;

  return (
    <IssueLabelSelect
      value={labelIds}
      projectId={projectId}
      onChange={onChange}
      disabled={disabled}
      label={
        labels.length > 0 ? (
          <span className="flex flex-shrink-0 items-center gap-1">
            {labels.slice(0, 2).map((label) => (
              <span
                key={label.id}
                className="flex items-center gap-1 rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-tertiary"
              >
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                <span className="normal-case">{label.name}</span>
              </span>
            ))}
            {labels.length > 2 ? (
              <span className="rounded-sm bg-layer-1 px-1.5 py-0.5 text-11 text-tertiary">+{labels.length - 2}</span>
            ) : null}
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-sm border-[0.5px] border-strong px-2 py-1 text-11 text-tertiary hover:bg-layer-1">
            <LabelPropertyIcon className="h-3 w-3 flex-shrink-0" />
            <span>Labels</span>
          </span>
        )
      }
    />
  );
});
```

- [ ] **Step 2: Use it in `block-item-action.tsx`**

Replace the entire label block (the `{canCurrentUserEditPage ? <IssueLabelSelect …/> : …chips… : null}` conditional added in Task 2) with:

```tsx
{
  /* labels */
}
<PageLabelSelect
  labelIds={label_ids ?? []}
  projectId={projectId}
  onChange={(labelIds) => page.updatePageLabels(labelIds)}
  disabled={!canCurrentUserEditPage}
/>;
```

Then fix imports: remove `import { IssueLabelSelect } from "@/components/issues/select";`, remove `import { useLabel } from "@/hooks/store/use-label";`, remove the `const { getLabelById } = useLabel();` line (all now unused), and add `import { PageLabelSelect } from "@/components/pages/page-label-select";`. Keep the `canCurrentUserEditPage`, `label_ids`, `project_ids` destructure and `const projectId = project_ids?.[0];`.

- [ ] **Step 3: Use it in `labels-info.tsx`**

Replace `import { IssueLabelSelect } from "@/components/issues/select";` with `import { PageLabelSelect } from "@/components/pages/page-label-select";`, and replace the `<IssueLabelSelect … />` element with:

```tsx
<PageLabelSelect
  labelIds={label_ids ?? []}
  projectId={projectId}
  onChange={(labelIds) => page.updatePageLabels(labelIds)}
  disabled={!canCurrentUserEditPage}
/>
```

Keep the existing early-return guard and the "Labels" heading exactly as they are.

- [ ] **Step 4: Type-check**

Run: `cd /home/dev/plane && npx turbo run check:types --filter=web`
Expected: PASS (0 errors). The `getLabelById(...).filter((label) => !!label)` pattern is the same one already used and type-checked in `block.tsx`/`block-item-action.tsx`.

- [ ] **Step 5: Lint**

Run: `cd /home/dev/plane && npx turbo run check:lint --filter=web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/plane
git add apps/web/core/components/pages/page-label-select.tsx apps/web/core/components/pages/list/block-item-action.tsx apps/web/core/components/pages/navigation-pane/tab-panels/info/labels-info.tsx
git commit -m "feat(pages): show named label chips on the row/Info trigger"
```

---

## Final verification (after all tasks)

- [ ] `cd /home/dev/plane && npx turbo run check:types --filter=web` — clean
- [ ] `cd /home/dev/plane && npx turbo run check:lint --filter=web` — clean
- [ ] Whole-branch review, then merge to `preview` and deploy via agent42-coolify app `z3h4ulr5t2fz4zzkxcvi24w8` (expect the usual ~1–5 min 502/503 flap; self-heals).

## Notes for the deploy/test pass

- Tag `# PRD — zadání a rozsah MVP` and `Call s nákupním oddělením — 25. 5. 2026` as **SPLY** → they should appear at `feedback.sply.company/dokumenty`.
- After deploy, a stuck Plane spinner is the stale-SPA-asset cache-bust, not an outage — hard reload / private tab.
