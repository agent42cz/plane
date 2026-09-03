# Sign-in: password managers (1Password) show nothing → SPA document-hydration failure

- **Date:** 2026-09-03
- **Task:** AIAGE-61
- **Fix commits (on `preview`):** `1918be6b3` (the real cause), `0be6437fa` (form/title cleanup)
- **Files:** `apps/web/app/root.tsx` (`HydrateFallback`)

## Symptom

On `plane.agent42.cz` the 1Password browser extension showed **no inline icon
and no autofill menu** on the sign-in page, even though a matching login item
existed for the domain. Telltale sign that it's *this* bug and not an extension
setting: a **static** page served from the **same origin** (e.g. a saved copy of
the sign-in HTML) **does** get the 1Password icon, but the running app does not.
Nothing is logged in production.

## Root cause

The web app hydrates the **whole document**: `entry.client.tsx` calls
`hydrateRoot(document, <HydratedRouter/>)`.

We run in **SPA mode** (`react-router.config.ts` → `ssr: false`). React Router
prerenders `index.html` by rendering only the **root route's `HydrateFallback`**
in Node. `HydrateFallback` rendered **theme-dependent** content:

```tsx
// old
const { resolvedTheme } = useTheme();               // next-themes
if (typeof window === "undefined" || resolvedTheme === undefined) return <div />;
return <div ...><LogoSpinner/></div>;               // theme-dependent
```

- **Prerender (Node):** `resolvedTheme` is `undefined` → fallback is an empty `<div/>`.
- **First client render:** next-themes resolves the theme *synchronously* (from the
  inline theme script / `localStorage`) → fallback is `<div><LogoSpinner/></div>`.

Those differ, so hydration hits a **structural mismatch at the root of the
document**. React's recovery for a failed *document* hydration is to **throw away
the server-rendered DOM and re-render the whole page on the client**. It reports
this (with warnings enabled) as:

```
Hydration failed because the initial UI does not match what was rendered on the server.
Warning: An error occurred during hydration. The server HTML was replaced with client content in #document.
  ... at div at LogoSpinner
```

That full re-render recreates `<html>`/`<body>` and **discards anything a browser
extension injected** — including 1Password's autofill UI and the field references
its content script had attached. It never recovers, so the icon never appears.

It's **silent in production** because `Layout` sets `suppressHydrationWarning` on
`<html>` and `<body>` (needed to hide next-themes' benign
`Extra attributes from the server: data-theme` warning). Suppression hides the
log; it does **not** prevent the re-render.

## The fix

Make `HydrateFallback`'s **first client render identical to the prerender** (an
empty `<div/>`), then reveal the spinner after mount:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (typeof window === "undefined" || !mounted || resolvedTheme === undefined) return <div />;
return <div ...><LogoSpinner/></div>;
```

Hydration now matches, the document is preserved, and the extension's UI survives.

## Fast regression check

If password-manager autofill disappears on the sign-in page again:

1. Open the sign-in page in Chrome DevTools **Console**. The bug is back if you see
   `The server HTML was replaced with client content in #document` (or minified
   React error **#418/#423/#425** in prod). No such message = a *different* problem.
2. Reproduce headless without the extension — a clean run should log **no**
   `#document` hydration error:
   ```js
   // node, with playwright installed; CF-Access headers if behind Cloudflare Access
   const { chromium } = require("playwright");
   const p = await (await (await chromium.launch()).newContext()).newPage();
   p.on("console", m => /#document|Hydration failed|Minified React error #(418|423|425)/.test(m.text()) && console.log("REGRESSED:", m.text()));
   await p.goto("https://plane.agent42.cz/", { waitUntil: "load" });
   await p.waitForSelector("form input[type=password]"); await p.waitForTimeout(2500);
   ```

## Don't repeat these mistakes

- **The rule:** anything rendered by the root `HydrateFallback` (and by `Layout`)
  must be byte-identical between the Node prerender and the first client render.
  Never let it depend on `next-themes`, `localStorage`, `window`, timers, or random
  ids without gating behind a mounted flag. This applies to the *whole* document
  because we hydrate `document`.
- **Unreliable probe:** measuring "was `<html>`/`<body>` replaced?" by tagging
  `document.documentElement` from Playwright's `addInitScript` and checking later is
  **wrong** — that tag disappears even on a plain static page (init-script isolation),
  so it reports a teardown that isn't there. Trust React's own console message
  (`#document` replaced), not a DOM-identity probe.
- Fixes that target only the *body* (e.g. a hydrating `clientLoader`) do **not** help:
  the mismatch is inside `HydrateFallback` itself.
