# agent42cz/plane: what this fork changes

This fork runs `plane.agent42.cz`. Coolify (app "Plane", docker-compose) builds it from the
`preview` branch. The fork tracks `makeplane/plane` `preview` (remote `upstream`).

Keep this list current. It is what you re-check after every upstream merge.

## Updating from upstream

1. `git fetch upstream --tags`, then branch off `origin/preview` and run `git merge upstream/preview`.
   Prefer the latest release tag if `preview` turns out to be unstable.
2. Resolve conflicts against the list below. Upstream moves files around: in 1.5, `apps/web/core/components`
   became `apps/web/components`, and `@plane/ui` / `@plane/propel` were replaced by `@makeplane/propel` and
   `@plane/blocks`. Fork-only files then have to be ported to the new UI kit.
3. `pnpm install`, `pnpm check`, and the backend suite (`docker-compose-test.yml`).
4. Back up the Postgres DB and the `uploads` volume before deploying. Django migrations only go forward.
5. After deploying, check every item below plus `/api/instances/` (version), sign-in, work item / comment /
   attachment create, and the Plane MCP (read a work item, comment, relations GET and POST).

Merge upstream after every upstream release, not once a quarter.

## Fork changes

### Backend (`apps/api`)

- **Public read-only pages API**: `GET /api/v1/workspaces/<slug>/projects/<id>/pages/` (list) and
  `.../pages/<page_id>/` (detail with `description_html`). Only public, non-archived pages, only for active
  members of the URL project, with an active project link. Restricted guests see only their own pages, as in
  the app. Code: `plane/api/views/page.py`, `plane/api/urls/page.py`, `plane/api/serializers/page.py`.
  Tests: `plane/tests/contract/api/test_pages.py`.
- **Description images over the API**: `GET .../work-items/<id>/description-assets/` lists the images pasted
  into a work item's description, with presigned URLs. Same guest visibility as attachments.
  Code: `IssueDescriptionAssetListAPIEndpoint` in `plane/api/views/issue.py`.
- **Attachment MIME types**: `plane/utils/mime.py` checks types case-insensitively and logs rejections.
  `settings/common.py` adds macro-enabled / template Office types and `application/x-cfb`, the OLE2 wrapper
  that legacy `.xls` files are sniffed as. Tests: `plane/tests/unit/utils/test_mime.py`.

### Web (`apps/web`)

- **Page labels**: editable labels on page list rows and in the page Info panel, a labels filter in the pages
  list, and the `updatePageLabels` store action.
  Code: `components/pages/page-label-select.tsx`, `components/pages/navigation-pane/tab-panels/info/labels-info.tsx`,
  `components/pages/list/{block-item-action,filters/root,applied-filters/root}.tsx`, `store/pages/base-page.ts`.
- **Import .md into pages**: the "Import .md" button in the project pages header opens
  `components/pages/modals/import-markdown-modal.tsx`. It uses `convertMarkdownToHTML` / `deriveNameFromMarkdown`
  from `packages/utils/src/editor/markdown-parser/`, which needs the extra `remark-parse`, `remark-rehype` and
  `rehype-stringify` dependencies.
- **Password-manager sign-in (1Password)**: on credential-only instances (password on, magic code off) the
  email and password are on one form (`components/account/auth-forms/form-root.tsx`, `password.tsx`), with
  `autocomplete` tokens and DOM-to-state sync for autofill. `app/root.tsx` `HydrateFallback` renders an empty
  `<div>` until mount so hydration does not wipe 1Password's UI.
  See `docs/superpowers/notes/2026-09-03-1password-signin-hydration.md`.

### Build and deploy

- `docker-compose.yml`: every service reads `.env` (Coolify writes it). The proxy only `expose`s port 80,
  because Coolify's Traefik terminates HTTPS. Migrator uses `restart: "no"`.
- App Dockerfiles: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` and the pnpm bin dir on `PATH`, needed for pnpm 11
  builds.
- Object storage is `docker.io/pgsty/silo` on the existing `uploads` volume. `minio/minio` is no longer
  pullable from Docker Hub or quay.io.
