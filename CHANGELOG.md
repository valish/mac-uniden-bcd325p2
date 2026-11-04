# Changelog

## 0.1.0 — release candidate

- Local BCD325P2 programming through desktop Chrome Web Serial on macOS.
- Portable, source-linked JSON plans; conventional CSV import and manual entry.
- Conventional and P25 Standard systems with sites, talkgroups and listening keys.
- Durable pre-write snapshots, receipt-scoped resume and fresh-session readback.
- Agent research briefs, CLI validation/staging, a local stdio MCP server and a channel-planning skill.
- Searchable channel tables and a printable reference that includes On/Off scan states.
- Locally bundled IBM Plex Sans, a compact utility layout and example-only README screenshots.

Experimental hardware coverage: the original protocol core allocated a full plan; the standalone application subsequently rewrote and verified those existing records on BCD325P2 firmware 1.11.11. Standalone allocation of new records and received audio remain unverified. See [compatibility](docs/COMPATIBILITY.md).

There is no automatic restore, erase/reset/delete, firmware updater or full scanner editor. Other scanner models and non-P25 trunking writes are unsupported.
