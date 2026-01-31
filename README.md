# Trade Tracker

A trading journal application for tracking and managing your trades across stocks and crypto.

## Features

- Record buy/sell trades with price, quantity, and notes
- Track trade direction (long/short)
- Support for stocks and crypto assets
- Real-time data sync with Convex backend
- Secure authentication with Clerk

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Backend:** Convex (serverless with real-time sync)
- **Auth:** Clerk
- **Styling:** Tailwind CSS 4
- **Language:** TypeScript

## Getting Started

### Prerequisites

- Node.js 22.19.0 (see `.nvmrc`)
- pnpm 10.x
- Convex account (for backend)
- Clerk account (for authentication)

### Environment Variables

Create a `.env.local` file with:

```bash
# Convex
CONVEX_DEPLOYMENT=dev:your-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# In another terminal, start Convex dev server
npx convex dev
```

### Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking

## Project Structure

```
├── convex/           # Convex backend (schema, functions)
├── public/           # Static assets
├── src/
│   ├── app/          # Next.js App Router pages
│   ├── components/   # React components
│   │   └── ui/       # UI component library
│   ├── lib/          # Utility functions
│   └── styles/       # Global CSS
└── .github/          # GitHub Actions workflows
```

## License

MIT
