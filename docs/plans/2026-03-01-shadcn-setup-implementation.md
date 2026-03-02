# ShadCN CLI Setup + Component Consistency Pass — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up ShadCN CLI infrastructure for adding new components, normalize styling inconsistencies across existing UI components, and update CLAUDE.md to prevent future agents from recreating these issues.

**Architecture:** Add `components.json` config at project root for the ShadCN CLI. Fix inconsistent focus rings, transitions, disabled states, and color tokens across 7 existing components without changing any APIs. Add agent guidance to CLAUDE.md about reusing existing components and using ShadCN for new ones.

**Tech Stack:** ShadCN CLI, Tailwind CSS v4, Radix color tokens, CVA

---

## Task 1: Set up ShadCN CLI (`components.json`)

**Files:**
- Create: `components.json`

**Step 1: Create `components.json`**

Create the file at the project root with this exact content:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/global.css",
    "baseColor": "slate",
    "cssVariables": false
  },
  "aliases": {
    "components": "~/components",
    "utils": "~/lib/utils",
    "ui": "~/components/ui",
    "lib": "~/lib",
    "hooks": "~/hooks"
  },
  "iconLibrary": "lucide"
}
```

**Step 2: Verify the CLI recognizes the config**

Run: `npx shadcn@latest diff 2>&1 | head -20`

Expected: The CLI should recognize the config file and either list components or show "no differences". Any error about missing `components.json` means the config isn't being read.

**Step 3: Commit**

```bash
git add components.json
git commit -m "chore: add ShadCN CLI config (components.json)"
```

---

## Task 2: Normalize focus rings across all components

The current state is inconsistent:
- **Button:** `focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1`
- **Input:** `focus-visible:ring-1 focus-visible:ring-olive-7` (no offset)
- **Textarea:** `focus-visible:ring-1 focus-visible:ring-olive-7` (no offset)
- **RadioGroup item:** `focus-visible:ring-2 focus-visible:ring-blue-8/50` (no offset)
- **Dialog close button:** `focus:ring-2 focus:ring-slate-7 focus:ring-offset-2 focus:ring-offset-slate-800` (uses `focus:` not `focus-visible:`)

**Target standard for interactive controls:** `focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1`

This uses ring-2 (visible but not heavy), blue-8 (consistent focus color matching links/info), with offset so the ring doesn't overlap the element border.

**Files:**
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/textarea.tsx`
- Modify: `src/components/ui/radio-group.tsx`
- Modify: `src/components/ui/dialog.tsx`

**Step 1: Fix Input focus ring**

In `src/components/ui/input.tsx`, in the `inputBaseClasses` string (line 7), replace:
- `focus-visible:ring-olive-7 focus-visible:outline-hidden` → `focus-visible:ring-blue-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1 focus-visible:outline-hidden`
- `focus-visible:ring-1` → `focus-visible:ring-2`

**Step 2: Fix Textarea focus ring**

In `src/components/ui/textarea.tsx`, in the `textareaClassName` base string (line 22), replace:
- `focus-visible:ring-olive-7 focus-visible:outline-hidden` → `focus-visible:ring-blue-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1 focus-visible:outline-hidden`
- `focus-visible:ring-1` → `focus-visible:ring-2`

**Step 3: Fix RadioGroup item focus ring**

In `src/components/ui/radio-group.tsx`, in the `RadioGroupItem` className (line 58), replace:
- `focus-visible:ring-blue-8/50 focus-visible:outline-none focus-visible:ring-2` → `focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1 focus-visible:outline-none`

**Step 4: Fix Dialog close button focus ring**

In `src/components/ui/dialog.tsx`, in the `DialogPrimitive.Close` className (line 44), replace:
- `focus:outline-none focus:ring-2 focus:ring-slate-7 focus:ring-offset-2 focus:ring-offset-slate-800` → `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1`

**Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors (we only changed class strings, not types)

**Step 6: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/textarea.tsx src/components/ui/radio-group.tsx src/components/ui/dialog.tsx
git commit -m "fix: normalize focus ring styles across UI components"
```

---

## Task 3: Fix Dialog to use Radix color tokens

The Dialog component uses Tailwind default colors (`slate-700`, `slate-800`) instead of the project's Radix color tokens. This is inconsistent with every other component.

**Files:**
- Modify: `src/components/ui/dialog.tsx`

**Step 1: Fix DialogContent colors**

In `src/components/ui/dialog.tsx`, in the `DialogContent` className (line 38), replace:
- `border border-slate-700 bg-slate-800 p-6 shadow-lg` → `border border-olive-6 bg-olive-2 p-6 shadow-lg`

This matches the Card component's color approach (olive for surfaces).

**Step 2: Fix DialogClose text colors**

In `src/components/ui/dialog.tsx`, in the `DialogPrimitive.Close` className (line 44), replace:
- `text-slate-11 opacity-70 transition-opacity hover:opacity-100` → `text-olive-11 transition-colors hover:text-olive-12`

Use color transition instead of opacity for a cleaner hover effect.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "fix: use Radix color tokens in Dialog component"
```

---

## Task 4: Normalize transitions and disabled states

**Current inconsistencies:**
- Button uses `transition-all` (animates everything including layout), others use `transition-colors`
- Button uses `disabled:pointer-events-none`, Input/Textarea/RadioGroup use `disabled:cursor-not-allowed`

**Target:**
- `transition-colors` everywhere (lighter, only animates what matters)
- `disabled:pointer-events-none disabled:opacity-50` for buttons (prevents clicks entirely)
- `disabled:cursor-not-allowed disabled:opacity-50` for form inputs (shows feedback cursor)

This split is intentional: buttons should block interaction entirely, form inputs should show a visual cue that they can't be edited.

**Files:**
- Modify: `src/components/ui/button.tsx`

**Step 1: Fix Button transition**

In `src/components/ui/button.tsx`, in the `buttonClassName` base string (line 30), replace:
- `transition-all` → `transition-colors`

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "fix: use transition-colors instead of transition-all on Button"
```

---

## Task 5: Run full CI checks and verify

**Step 1: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Run build**

Run: `pnpm build`
Expected: Successful build with no errors

**Step 4: Verify ShadCN CLI works**

Run: `npx shadcn@latest add --dry-run separator 2>&1`

Expected: The CLI should show what files it would create/modify without actually making changes. This confirms the CLI is functional for future component additions.

**Step 5: Commit any remaining changes (if needed)**

If lint or build produced auto-fixes, commit them.

---

## Task 6: Update CLAUDE.md with component reuse and ShadCN guidance

Agents have been building UI from scratch instead of reusing existing components, and using inconsistent colors/styles. Add guidance to prevent this.

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Expand the "UI Components" section**

In `CLAUDE.md`, replace the existing `### UI Components` section:

```markdown
### UI Components (`src/components/ui/`)

Reusable UI components are exported from `src/components/ui/index.ts`.

Prefer icon buttons over text.
```

With this expanded version:

````markdown
### UI Components (`src/components/ui/`)

Reusable UI components are exported from `src/components/ui/index.ts`.

Prefer icon buttons over text.

**IMPORTANT — Reuse existing components.** Before building any UI element, check `src/components/ui/index.ts` for an existing component that does what you need. If an existing component is close but not quite right, extend it with a new variant or prop rather than creating a new component. Do not build custom buttons, inputs, cards, dialogs, labels, textareas, alerts, badges, or radio groups — these already exist.

**Adding new components:** Use the ShadCN CLI to add new components:

```bash
npx shadcn@latest add <component-name>
```

After adding a ShadCN component, you MUST make these modifications before using it:
1. **Replace CSS variable colors** with Radix color tokens (see Style Standards below)
2. **Add `dataTestId` prop** to any interactive element (all interactive components require this)
3. **Verify dark-mode appearance** — this app is dark-mode only
````

**Step 2: Add a "Style Standards" subsection to the Theme section**

In `CLAUDE.md`, replace the existing `### Theme` section:

```markdown
### Theme

Dark-mode only. No light-mode CSS variables. Color scales: grass, olive, slate, green, red, amber, blue (Radix-based).
```

With this expanded version:

```markdown
### Theme

Dark-mode only. No light-mode CSS variables. Color scales: grass, olive, slate, green, red, amber, blue (Radix-based).

#### Style Standards

All components must follow these conventions for consistency:

| Property | Standard |
|----------|----------|
| Surface backgrounds | `bg-olive-2` (cards, dialogs, dropdowns) |
| Surface borders | `border-olive-6` (resting), `border-olive-7` (inputs) |
| Primary text | `text-olive-12` or `text-slate-12` |
| Secondary text | `text-olive-11` or `text-slate-11` |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1` |
| Primary action | `bg-grass-9 hover:bg-grass-10 text-grass-1` |
| Destructive action | `bg-red-9 hover:bg-red-10 text-red-1` |
| Disabled (buttons) | `disabled:pointer-events-none disabled:opacity-50` |
| Disabled (inputs) | `disabled:cursor-not-allowed disabled:opacity-50` |
| Transitions | `transition-colors` (not `transition-all`) |

Do NOT use Tailwind's default color scales (e.g., `slate-700`, `slate-800`, `gray-200`). Always use the Radix 12-step tokens defined in `src/styles/global.css`.
```

**Step 3: Run typecheck (sanity check)**

Run: `pnpm typecheck`
Expected: No errors (only markdown changed)

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add component reuse and style standards guidance to CLAUDE.md"
```
