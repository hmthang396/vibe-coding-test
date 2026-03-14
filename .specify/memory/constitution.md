<!--
  SYNC IMPACT REPORT
  ==================
  Version change: [template/unpopulated] → 1.0.0
  Modified principles: N/A (initial population from template)
  Added sections:
    - Core Principles (5 principles derived from codebase)
    - Technology Stack & Constraints
    - Development Workflow
    - Governance
  Removed sections: N/A
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ Constitution Check section is generic — compatible as-is
    - .specify/templates/spec-template.md ✅ No constitution-specific references — compatible as-is
    - .specify/templates/tasks-template.md ✅ Task structure compatible with these principles
  Follow-up TODOs: None — all placeholders resolved.
-->

# OTP Auth Service Constitution

## Core Principles

### I. Security-First (NON-NEGOTIABLE)

Security MUST be the primary design constraint at every layer of the system.

- OTPs MUST be single-use and time-limited (no reuse after consumption or expiry).
- Secrets (JWT signing keys, SMTP credentials, Redis passwords) MUST be loaded from environment
  variables; they MUST NOT be hardcoded or committed to source control.
- Passwords MUST be stored as salted hashes (bcrypt or equivalent); plaintext passwords MUST
  never be logged, returned in API responses, or persisted.
- All authentication state transitions MUST be validated server-side; client-supplied tokens MUST
  be verified cryptographically before any protected resource is accessed.
- Security-sensitive operations (OTP generation, login attempts, token refresh) MUST be logged at
  appropriate severity levels for audit trail purposes.

**Rationale**: This service's sole purpose is authentication. A single security regression
undermines the entire system. All other principles are subordinate to this one.

### II. Module-Driven Architecture

The NestJS module boundary is the primary unit of encapsulation.

- Each domain area (auth, OTP, mail, users, redis) MUST live in its own NestJS module with a
  dedicated module file, and expose only the services required by other modules.
- Cross-module communication MUST go through injected service interfaces; direct instantiation
  of another module's services is prohibited.
- The root `AppModule` MUST wire modules together but contain no business logic itself.
- Controllers MUST delegate all business logic to injected services; fat controllers are a defect.

**Rationale**: Encapsulation makes individual modules independently testable, replaceable, and
auditable — critical properties for a security-sensitive codebase.

### III. Test-First Development

Automated tests are a delivery requirement, not an afterthought.

- Unit tests (`.spec.ts`) MUST exist alongside every service file.
- E2E tests (`test/`) MUST cover the happy path and principal error paths for every HTTP endpoint.
- New behaviour MUST have a failing test before implementation begins (Red-Green-Refactor).
- Tests MUST pass (`pnpm run test` and `pnpm run test:e2e`) before a feature branch is merged.
- Test coverage MUST not regress below the level established at the prior merge.

**Rationale**: Authentication bugs are often silent. Tests provide the only mechanical safety net
against regressions in login flows, OTP validation, and guard enforcement.

### IV. Stateless HTTP with Externalised State

The HTTP layer MUST be stateless; all runtime state lives in Redis or the database.

- OTP codes and pending-2FA session markers MUST be stored in Redis with a TTL; they MUST NOT
  be held in process memory.
- JWT tokens MUST be stateless (self-contained claims); the server MUST NOT maintain a token
  store in process memory.
- Durable data (user records, credentials) MUST be persisted in the relational database via
  TypeORM entities and migrations.
- Database schema changes MUST be expressed as versioned TypeORM migrations; ad-hoc schema
  mutations in application code are prohibited.

**Rationale**: Stateless servers can be horizontally scaled and restarted without losing
authentication state, which is a mandatory operational property.

### V. Simplicity & YAGNI

The minimum complexity that satisfies the current requirement is the correct amount.

- Abstractions (repositories, factories, decorators) MUST be introduced only when two or more
  concrete use-cases justify them.
- Features MUST NOT be built speculatively; implement what is specified, nothing more.
- Dependencies MUST be evaluated against necessity; prefer the NestJS/Node.js standard library
  before adding a third-party package.
- Code complexity MUST be justified in comments or PR description when it cannot be avoided.

**Rationale**: Over-engineering increases the attack surface and the cognitive burden on
reviewers. Simpler code is easier to audit for security defects.

## Technology Stack & Constraints

- **Runtime**: Node.js LTS; **Framework**: NestJS 11; **Language**: TypeScript (strict mode).
- **Package manager**: pnpm — no npm or yarn lock files MUST be committed.
- **ORM**: TypeORM with PostgreSQL; all schema changes via migrations in `src/migrations/`.
- **Cache / ephemeral state**: Redis — accessed through the `RedisModule` wrapper.
- **Mail**: Nodemailer (or equivalent) via `MailModule`; SMTP credentials from environment.
- **Auth tokens**: JWT via `@nestjs/jwt`; signing secret from environment.
- **Linting**: ESLint flat config (`eslint.config.mjs`) with `typescript-eslint` recommended
  type-checked rules; `prettier` for formatting. CI MUST fail on lint errors.
- **Environment**: All configuration MUST be read from environment variables; a `.env.example`
  file MUST document every required variable without real values.

## Development Workflow

- **Branching**: Feature work on short-lived branches off `main`; branch names SHOULD follow
  `###-short-description` convention.
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- **Pre-merge gate**: `pnpm run lint`, `pnpm run test`, and `pnpm run build` MUST all pass.
- **Task tracking**: Use `bd` for all task tracking; markdown TODOs and `TodoWrite` are
  prohibited (per `CLAUDE.md`).
- **Session hygiene**: Run `bd prime` at session start; `bd sync` then `git push` at session end.
- **Code review**: All changes to auth flows, OTP logic, or guard implementations MUST be
  reviewed for security correctness before merge, not just functional correctness.

## Governance

This constitution supersedes all other written practices in this repository. Where it conflicts
with a template or README passage, the constitution takes precedence and the conflicting document
MUST be updated.

**Amendment procedure**:

1. Propose the change with a rationale in a PR description.
2. Bump `CONSTITUTION_VERSION` according to semantic versioning:
   - MAJOR — backward-incompatible principle removal or redefinition.
   - MINOR — new principle or section added / materially expanded.
   - PATCH — clarifications, wording, or typo fixes.
3. Update `LAST_AMENDED_DATE` to the amendment date.
4. Run the consistency propagation checklist (templates, README) and mark results in the Sync
   Impact Report embedded as an HTML comment at the top of this file.
5. Merge only after all checklist items are resolved.

**Compliance review**: Every PR touching `src/auth/`, `src/otp/`, or guard files MUST include a
self-attestation in the PR description confirming that the Security-First and Test-First
principles have been satisfied.

**Version**: 1.0.0 | **Ratified**: 2026-03-14 | **Last Amended**: 2026-03-14
