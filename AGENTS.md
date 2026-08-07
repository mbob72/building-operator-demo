# Repository operating rules

This MVP is developed sequentially by one coding agent.

- Do not start a new delivery stage without explicit user approval.
- Keep domain and transport contracts in `src/shared` and `contracts`.
- Keep scene rendering independent from React component structure.
- Do not parse IFC in the browser; source preparation is an offline pipeline.
- Record reversible assumptions in `docs/assumptions.md`.
- Run `npm run verify` before presenting a stage for approval.
- Stage 0 contains no devices and must not pre-empt decisions belonging to later stages.
