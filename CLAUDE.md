# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Development (watch mode)
pnpm run start:dev

# Build
pnpm run build

# Lint (auto-fix)
pnpm run lint

# Format
pnpm run format

# Unit tests
pnpm run test

# Run a single test file
pnpm run test -- --testPathPattern=app.controller

# E2E tests
pnpm run test:e2e

# Test coverage
pnpm run test:cov
```

## Architecture

This is a NestJS 11 application using TypeScript and pnpm.

**NestJS module structure:** Each feature follows the controller → service pattern. `AppModule` (`src/app.module.ts`) is the root module that wires together controllers and providers.

- `src/main.ts` — Bootstrap entry point; listens on `PORT` env var or 3000
- `src/app.module.ts` — Root module
- `src/app.controller.ts` — HTTP route handlers
- `src/app.service.ts` — Business logic injected into controllers
- `test/` — E2E tests using Supertest against the live NestJS app

**Testing:** Unit tests (`.spec.ts`) live alongside source files in `src/`; Jest is configured to look for `*.spec.ts` in `src/`. E2E tests live in `test/` and use a separate Jest config (`test/jest-e2e.json`).

**ESLint config:** Uses flat config (`eslint.config.mjs`) with `typescript-eslint` recommended type-checked rules and `eslint-plugin-prettier`. Key rule overrides: `@typescript-eslint/no-explicit-any` is off, floating promises and unsafe arguments are warnings only.
