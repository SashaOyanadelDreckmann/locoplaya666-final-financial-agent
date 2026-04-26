# QA Smoke

## Official smoke entrypoint
- Script: `apps/api/qa_smoke_ci.mjs`
- Command (from repo root): `pnpm qa:smoke`

This smoke validates:
1. Register + intake until `/agent`
2. Agent response contains chart evidence
3. Agent response contains PDF evidence

## Legacy scripts
- Archived at: `apps/api/qa_legacy/`
- These were exploratory/debug scripts and are not part of CI.
