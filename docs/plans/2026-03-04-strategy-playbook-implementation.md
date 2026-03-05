# Strategy Playbook Implementation Plan

**Goal:** Add a `/strategy` page with an inline WYSIWYG Markdown editor (Tiptap) for capturing and iterating on a personal trading playbook, with auto-save to Convex.

**Architecture:** New Convex table (`strategyDoc`) stores a single markdown document per user. A new Next.js page at `/strategy` renders a Tiptap editor that loads the document, auto-formats markdown syntax inline, and debounce-saves changes back to Convex. No toolbar — markdown shortcuts only.

**Tech Stack:** Tiptap v3 (editor), `@tiptap/markdown` (serialization), Convex (backend), Next.js App Router (page routing)

---

## Task 1: Install Tiptap Dependencies

**Files:**

- Modify: `package.json`

**Step 1: Install all Tiptap packages**

Run:

```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/pm @tiptap/extension-link @tiptap/extension-image @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-placeholder @tiptap/markdown
```

**Step 2: Verify installation**

Run: `pnpm typecheck`
Expected: PASS (no type errors introduced)

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(strategy): add Tiptap editor dependencies"
```

---

### Task 2: Add Convex `strategyDoc` Table and Functions

**Files:**

- Modify: `convex/schema.ts` (add `strategyDoc` table)
- Create: `convex/strategyDoc.ts` (query + mutation)

**Step 1: Add the table to the schema**

In `convex/schema.ts`, add this table definition inside `defineSchema({...})` (after the `inboxTrades` table):

```typescript
strategyDoc: defineTable({
  content: v.string(),
  ownerId: v.string(),
  updatedAt: v.number(),
}).index("by_owner", ["ownerId"]),
```

**Step 2: Create the Convex functions file**

Create `convex/strategyDoc.ts`:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";

const strategyDocValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("strategyDoc"),
  content: v.string(),
  ownerId: v.string(),
  updatedAt: v.number(),
});

export const get = query({
  args: {},
  returns: v.union(strategyDocValidator, v.null()),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const doc = await ctx.db
      .query("strategyDoc")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    return doc;
  },
});

export const save = mutation({
  args: {
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const existing = await ctx.db
      .query("strategyDoc")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("strategyDoc", {
        content: args.content,
        ownerId,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add convex/schema.ts convex/strategyDoc.ts
git commit -m "feat(strategy): add strategyDoc Convex table and functions"
```

---

### Task 3: Create the Tiptap Editor Component

**Files:**

- Create: `src/components/ui/strategy-editor.tsx`

**Step 1: Create the editor component**

Create `src/components/ui/strategy-editor.tsx`:

```tsx
"use client";

import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import { useCallback, useEffect, useRef } from "react";

interface StrategyEditorProps {
  initialContent: string;
  onUpdate: (markdown: string) => void;
}

export function StrategyEditor({
  initialContent,
  onUpdate,
}: StrategyEditorProps) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-9 underline hover:text-blue-10 cursor-pointer",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full rounded-lg",
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing your trading strategy...",
      }),
      Table.configure({
        resizable: false,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Markdown,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "prose-strategy outline-none min-h-[60vh] px-6 py-4",
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown();
      onUpdateRef.current(markdown);
    },
  });

  // Update content if initialContent changes externally (shouldn't normally happen,
  // but handles edge cases like hot reload)
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (editor && !hasInitialized.current) {
      hasInitialized.current = true;
    }
  }, [editor]);

  return (
    <div className="rounded-lg border border-olive-7 bg-olive-2 focus-within:ring-2 focus-within:ring-blue-8 focus-within:ring-offset-2 focus-within:ring-offset-olive-1">
      <EditorContent editor={editor} />
    </div>
  );
}
```

**Step 2: Add editor styles**

Add to `src/styles/global.css` (at the end of the file, after existing styles):

```css
/* Strategy Editor - Tiptap prose styles */
.prose-strategy {
  color: var(--olive-12);
  font-size: 1rem;
  line-height: 1.75;
}

.prose-strategy h1 {
  color: var(--slate-12);
  font-size: 1.875rem;
  font-weight: 700;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  line-height: 1.2;
}

.prose-strategy h2 {
  color: var(--slate-12);
  font-size: 1.5rem;
  font-weight: 700;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  line-height: 1.3;
}

.prose-strategy h3 {
  color: var(--slate-12);
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

.prose-strategy p {
  margin-bottom: 0.75rem;
}

.prose-strategy strong {
  color: var(--slate-12);
  font-weight: 600;
}

.prose-strategy em {
  font-style: italic;
}

.prose-strategy blockquote {
  border-left: 4px solid var(--olive-6);
  padding-left: 1rem;
  color: var(--olive-11);
  font-style: italic;
  margin: 0.75rem 0;
}

.prose-strategy hr {
  border-color: var(--olive-6);
  margin: 1.5rem 0;
}

.prose-strategy ul {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin-bottom: 0.75rem;
}

.prose-strategy ol {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin-bottom: 0.75rem;
}

.prose-strategy li {
  margin-bottom: 0.25rem;
}

.prose-strategy li p {
  margin-bottom: 0.25rem;
}

.prose-strategy img {
  max-width: 100%;
  border-radius: 0.5rem;
  margin: 0.75rem 0;
}

.prose-strategy table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
}

.prose-strategy th,
.prose-strategy td {
  border: 1px solid var(--olive-6);
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.prose-strategy th {
  background-color: var(--olive-3);
  font-weight: 600;
  color: var(--slate-12);
}

.prose-strategy a {
  color: var(--blue-9);
  text-decoration: underline;
}

.prose-strategy a:hover {
  color: var(--blue-10);
}

/* Placeholder styling */
.prose-strategy p.is-editor-empty:first-child::before {
  color: var(--olive-8);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

/* First heading has no top margin */
.prose-strategy > :first-child {
  margin-top: 0;
}
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/ui/strategy-editor.tsx src/styles/global.css
git commit -m "feat(strategy): create Tiptap editor component with prose styles"
```

---

### Task 4: Create the Strategy Page (Server + Client Components)

**Files:**

- Create: `src/app/strategy/page.tsx` (server component)
- Create: `src/app/strategy/StrategyPageClient.tsx` (client component)

**Step 1: Create the server component**

Create `src/app/strategy/page.tsx`:

```tsx
import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import StrategyPageClient from "./StrategyPageClient";

export default async function StrategyPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedDoc = await preloadQuery(
    api.strategyDoc.get,
    {},
    { token },
  );

  return <StrategyPageClient preloadedDoc={preloadedDoc} />;
}
```

**Step 2: Create the client component**

Create `src/app/strategy/StrategyPageClient.tsx`:

```tsx
"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StrategyEditor } from "~/components/ui/strategy-editor";
import { api } from "~/convex/_generated/api";

type SaveState = "idle" | "saving" | "saved";

export default function StrategyPageClient({
  preloadedDoc,
}: {
  preloadedDoc: Preloaded<typeof api.strategyDoc.get>;
}) {
  const doc = usePreloadedQuery(preloadedDoc);
  const saveDoc = useMutation(api.strategyDoc.save);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleUpdate = useCallback(
    (markdown: string) => {
      setError(null);

      // Clear any existing debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Clear any "saved" timer so we don't flash "Saved" while typing
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }

      setSaveState("idle");

      // Debounce: save 1 second after last keystroke
      debounceTimerRef.current = setTimeout(async () => {
        setSaveState("saving");
        try {
          await saveDoc({ content: markdown });
          setSaveState("saved");
          savedTimerRef.current = setTimeout(() => {
            setSaveState("idle");
          }, 2000);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to save",
          );
          setSaveState("idle");
        }
      }, 1000);
    },
    [saveDoc],
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-12">Strategy</h1>
        <div className="flex items-center gap-2 text-sm">
          {saveState === "saving" && (
            <span className="flex items-center gap-1 text-olive-11">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </span>
          )}
          {saveState === "saved" && (
            <span className="flex items-center gap-1 text-grass-9">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
          {error && (
            <span className="text-red-9">{error}</span>
          )}
        </div>
      </div>

      <StrategyEditor
        initialContent={doc?.content ?? ""}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/strategy/page.tsx src/app/strategy/StrategyPageClient.tsx
git commit -m "feat(strategy): add strategy page with auto-save editor"
```

---

### Task 5: Add Navigation Link

**Files:**

- Modify: `src/components/Header.tsx`

**Step 1: Add the nav link**

In `src/components/Header.tsx`, add the Strategy link to the `navLinks` array. Insert it after the Notes entry (line 19) and before Positions:

```typescript
const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/trade-plans", label: "Trade Plans" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/notes", label: "Notes" },
  { href: "/strategy", label: "Strategy" },
  { href: "/positions", label: "Positions" },
  { href: "/portfolio", label: "Portfolios" },
  { href: "/imports", label: "Import" },
  { href: "/accounts", label: "Accounts" },
];
```

**Step 2: Verify**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat(strategy): add Strategy link to navigation header"
```

---

### Task 6: Verify Full Build

**Step 1: Run lint**

Run: `pnpm lint`
Expected: PASS (no lint errors)

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Run build**

Run: `pnpm build`
Expected: PASS (successful production build)

**Step 4: Fix any issues found, then commit fixes if needed**

---

### Task 7: Manual Smoke Test

**Step 1: Start the dev server**

Run: `pnpm dev` (and `npx convex dev` in separate terminal)

**Step 2: Navigate to `/strategy`**

Verify:

- [ ] Page loads with "Strategy" heading
- [ ] Editor shows placeholder text "Start writing your trading strategy..."
- [ ] Navigation bar shows "Strategy" link between Notes and Positions
- [ ] Strategy link is highlighted when on the page

**Step 3: Test markdown shortcuts**

Type and verify each formats inline:

- [ ] `## Heading` → renders as h2
- [ ] `**bold**` → renders bold
- [ ] `*italic*` → renders italic
- [ ] `- item` → renders bullet list
- [ ] `1. item` → renders ordered list
- [ ] `> quote` → renders blockquote
- [ ] `---` → renders horizontal rule

**Step 4: Test auto-save**

- [ ] Type some content, wait 1 second
- [ ] "Saving..." appears briefly, then "Saved"
- [ ] Refresh the page — content persists
- [ ] Edit content — auto-saves again

**Step 5: Test error display**

- [ ] Verify error message appears if save fails (e.g., network disconnect)

**Step 6: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(strategy): address issues from smoke testing"
```
