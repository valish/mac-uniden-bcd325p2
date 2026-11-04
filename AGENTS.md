# Working with mac-uniden-bcd325p2

This is a local macOS Uniden BCD325P2 programmer, not a frequency database. Start with `docs/AGENT-START.md` when preparing channels for a user, and `docs/ARCHITECTURE.md` when changing software.

## Prepare a listening plan

- Research the user’s requested cities/counties, services and travel areas. Ask only for missing constraints that materially change the plan; a street address is not required.
- Use current sources through your own tools. Preserve URLs, checked dates, receive modes, source-to-channel links, exclusions and uncertainty. A site’s control frequency and a system talkgroup are different records. Prefer repeater outputs for reception.
- Read `schemas/plan.schema.json`. Produce `bcd325p2-plan-v1`, not raw scanner commands. Use `node src/cli.mjs validate FILE` and fix errors before `stage FILE`.
- Save personal plans outside tracked source or under `.local/`. Never commit scanner backups, receipts, session logs, addresses, phone numbers, credentials or a user’s emergency documents.
- Stage only the requested plan. MCP tools prepare and validate; the browser handles hardware connection and user-operated upload. Do not treat a staged plan or simulation as hardware success.
- Exclude encrypted-only traffic and unsupported system types with an explanation. Do not invent frequencies, talkgroups, source verification, reception guarantees or notable private operators.

## Change the software

- Runtime is Node.js 22+ and native browser modules, with no external runtime packages. Preserve the offline local workflow.
- Keep plan semantics in `src/plan.mjs` / `src/schema.mjs`, and regenerate `schemas/plan.schema.json` with `node scripts/check.mjs --write-schema` after schema changes.
- Protocol requests and responses have different offsets. Preserve command-by-command acknowledgments, index zero, reserved P25 fields, durable pre-write backup, receipt-scoped resume and separate write/finalization/readback sessions.
- Do not add erase/reset/delete or automatic hardware writes as an incidental change. Preserve unrelated existing systems and quick keys.
- Run `npm test`, `npm run check` and `npm run release:check`. For UI changes, run the documented browser checks and inspect desktop/mobile screenshots. Tests must check observable behavior, not only source text.
- Use synthetic fixtures. A successful original-core hardware test is not proof that a changed application has passed hardware testing.
- Keep this repository private. Publishing, changing repository visibility or enabling public hosting requires a new explicit user instruction. A private push is already authorized for this project.
