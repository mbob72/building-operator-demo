# Repository working agreement

## Development mode

- Work sequentially with one coding agent. Do not delegate to subagents unless the user explicitly changes this rule.
- Do not run Git commands or perform staging, commits, pushes, branch operations, or repository publication. Git is managed by the user.
- Do not start a later roadmap stage without explicit user approval.
- Keep product decisions, assumptions, contracts, reports, and stage status in the repository.

## Contract rules

- Runtime Zod schemas in `src/shared` are the contract source of truth.
- Generate backend-independent schemas with `npm run contracts:generate`.
- Never hand-edit generated `contracts/*.schema.json` files other than the legacy Stage 0 `scene.schema.json`.
- Keep scene geometry, stable device metadata, hot operational state, and UI-only state separate.
- Keep scene rendering independent from React component structure.
- Do not parse IFC in the browser; source preparation is an offline pipeline.
- Record reversible assumptions in `docs/assumptions.md`.
- Never place physical-system credentials in fixtures, bindings, logs, or frontend payloads.

## Verification

- Run `npm run verify` for contracts, unit tests, type checking, builds, and production smoke coverage.
- Run `npm run test:e2e` for browser acceptance.
- Record stage-specific results and known limitations before requesting stage approval.
