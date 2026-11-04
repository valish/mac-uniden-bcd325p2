---
name: bcd325p2-channel-planning
description: Research, validate and stage a source-checked listening plan for the Uniden BCD325P2 Mac programmer, using requested geographic areas and services. Use for BCD325P2 channel planning or preparing this project's JSON plans; not for transmitting, programming other models, or bypassing encryption.
---

# Prepare a BCD325P2 listening plan

Work in a checkout of `mac-uniden-bcd325p2`. Read `docs/AGENT-START.md` and `schemas/plan.schema.json` in that checkout. If the checkout is not supplied, locate the user's project before relying on relative paths. Do not install or modify unrelated agent configuration.

Use the user's areas, services and travel preferences. Town/county and state are usually enough; do not require a home address. Use your available research tools to check current sources. If live research is unavailable, work from supplied evidence and describe the resulting limits.

Distinguish conventional analog, conventional P25, and P25 Standard trunking. A trunk system requires sites/control frequencies and decimal talkgroups. Use receive/repeater-output frequencies. Retain source URLs, actual checked dates and channel/site source links. Record encrypted-only, unsupported or unsuitable entries under `excluded` with reasons. Do not infer a specific private operator's schedule or treat a license record as proof of active traffic.

Produce portable `bcd325p2-plan-v1` JSON. Full names are allowed; the compiler generates unique short scanner labels. Keep initial scanning focused. Continuous weather/broadcast stations normally belong in separate disabled systems. Do not invent fixed tone/NAC support: this version uses analog tone off and conventional P25 NAC Search.

Validate with `scanner_validate_plan` or `node src/cli.mjs validate FILE`. Correct errors and explain meaningful warnings. Stage with `scanner_stage_plan` or `node src/cli.mjs stage FILE`. Keep personal files in `.local/` or outside tracked source.

Staging prepares a proposal; it does not program the scanner. The user reviews in the browser, grants the serial connection, and starts the upload. Report hardware completion only from a completed receipt and final readback. Distinguish that from reception testing.

For partial uploads, read `docs/OPERATING.md`. Keep the source plan and private receipts, and let the programmer check matching records. Do not send ad hoc erase/delete/reset commands or retry uncertain allocations.
