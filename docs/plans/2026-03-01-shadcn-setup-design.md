# ShadCN CLI Setup + Component Consistency Pass

**Date:** 2026-03-01
**Status:** Design

## Problem

The project uses a custom component library built on ShadCN's underlying stack (Radix, CVA, tailwind-merge, clsx, lucide-react) but lacks the ShadCN CLI for easily adding new components. There are also minor consistency issues across existing components (focus rings, borders, spacing).

## Decision

Set up ShadCN CLI infrastructure without replacing existing components. Do a consistency normalization pass on existing components.

## What we're NOT doing

- Not replacing existing components with ShadCN versions
- Not adding ShadCN's CSS variable color system
- Not changing the Alert, Badge, or form system
- Not changing any component APIs

## Part 1: ShadCN CLI Infrastructure

Add `components.json` at project root configured for:

- **Style:** New York (matches our compact aesthetic)
- **Path aliases:** `~/*` for components and utils
- **Component path:** `src/components/ui`
- **Utils path:** `src/lib/utils.ts`
- **Tailwind CSS:** v4 (no tailwind.config — uses CSS-based config)
- **Dark mode only:** No light mode variables

When adding future ShadCN components, the only manual step will be swapping CSS variable references (e.g., `bg-background`) for Radix color classes (e.g., `bg-olive-2`).

## Part 2: Component Consistency Pass

Normalize these properties across Button, Input, Textarea, Card, Dialog, RadioGroup, Label:

| Property | Target standard |
|----------|----------------|
| Focus ring | `focus-visible:ring-2 focus-visible:ring-grass-9 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1` |
| Border color | `border-olive-6` (resting), `border-olive-8` (hover) |
| Border radius | `rounded-md` (default), `rounded-lg` (cards/dialogs) |
| Disabled state | `disabled:opacity-50 disabled:pointer-events-none` |
| Transition | `transition-colors` on interactive elements |

Exact values will be confirmed by reading each component and identifying deviations.
