# Uniden BCD325P2 programmer for macOS

A local, unofficial programmer for the **Uniden BCD325P2**. Prepare channels with your preferred LLM agent, import a source-checked plan, review it, and program the scanner through Chrome’s Web Serial connection.

**Experimental · private development repository · Node.js 22+ · no runtime packages or account required**

The original protocol core completed a physical upload on a BCD325P2 with firmware **1.11.11**, using an Apple Silicon Mac on macOS **26.2**. The standalone application subsequently reapplied and verified those existing records: 247 conventional channels, 28 talkgroups, five P25 sites and 15 site frequencies. That hardware test covered backup, every channel write, listening-key finalization and fresh-session readback through the new interface. Standalone creation of new records still needs a physical test; one device does not establish compatibility with every firmware or Mac. See the [validation record](docs/COMPATIBILITY.md).

## Start

Install [Node.js 22 or newer](https://nodejs.org/), then download or clone this repository. The repository is private during development, so GitHub access is required to download it.

```sh
git clone https://github.com/valish/mac-uniden-bcd325p2.git
cd mac-uniden-bcd325p2
npm start
```

Alternatively, double-click **Start Programmer.command**. No `npm install` is needed to run the app. Open the printed local URL in desktop Chrome. The default is `http://127.0.0.1:8326/`.

1. **Prepare a plan.** Use the agent brief, import JSON or conventional CSV, or add channels manually.
2. **Review.** Inspect names, frequencies, sites, talkgroups, sources and initial listening selections. Example JSON plans are preview-only until adapted.
3. **Connect.** Power on the BCD325P2, attach a mini-USB **data** cable, leave it on Scan/Hold, and select its serial port in Chrome.
4. **Program.** The app saves existing memory before writing, preserves existing systems, and verifies saved records and quick keys in a fresh programming session.
5. **Listen.** After “Upload verified,” press **Scan/Srch**. Readback proves configuration; reception still depends on activity, terrain, antennas and signal quality.

## Use your own agent

The application does not include an LLM, API key form or frequency database. Your assistant researches current sources with its own tools and produces the portable [plan format](schemas/plan.schema.json).

- **Chat or file-based assistant:** open “Prepare with an agent,” enter your areas and interests, and copy the research brief. Give the agent this repository’s [agent start guide](docs/AGENT-START.md).
- **Coding agent:** read [AGENTS.md](AGENTS.md), then use the CLI to validate and stage a plan.
- **Local MCP client:** run `node src/cli.mjs agent-config` and merge the generated entry into your client’s MCP configuration. The server supplies schema, research prompts, validation and a review inbox. It does not control scanner hardware.
- **Skills-capable agent:** use [skills/bcd325p2-channel-planning/SKILL.md](skills/bcd325p2-channel-planning/SKILL.md).

```sh
node src/cli.mjs brief --areas "Your city, county and state"
node src/cli.mjs validate /path/to/your-plan.json
node src/cli.mjs stage /path/to/your-plan.json
```

Return to the browser and choose **Refresh agent inbox → Review plan**. The user controls the final device connection and upload. [llms.txt](llms.txt) provides a concise navigation entrypoint for agents.

## Supported programming

| Item            | Current support                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scanner         | BCD325P2 only; model checked before memory access                                                                                                 |
| Conventional    | AM, FM, NFM, broadcast FM and conventional P25                                                                                                    |
| Trunking        | P25 Standard, Phase I/II; sites, frequencies, decimal talkgroups                                                                                  |
| Filters         | Analog tone filters off; conventional P25 NAC Search                                                                                              |
| Quick keys      | System/site and group assignments; initial selection; collision handling                                                                          |
| Input           | Portable JSON; conventional CSV; manual conventional entry                                                                                        |
| Recovery        | Durable receipts; reuse of matching partially written records                                                                                     |
| Backup          | Raw channel/system snapshot and selected globals; **no automatic restore**                                                                        |
| Not implemented | DMR, NXDN, EDACS, LTR or Motorola Type II writes; firmware updates; erase/reset/delete; full scanner editing; automatic frequency-database import |

The software does not bypass encryption. P25 support does not guarantee reliable simulcast reception. Fixed CTCSS, DCS and NAC filtering can be documented in notes but is not applied in this version. Non-P25 systems already present may be read for preservation if the protocol can describe them; this does not make them supported write targets.

## Your data

Plans, receipts, logs and snapshots stay under `.local/`, ignored by Git. The local server binds to `127.0.0.1`, validates host/origin and uses a session token for browser writes. There is no telemetry or remote service in the programmer.

An agent receives the information you provide to its client. Research briefs, staged plans and session summaries can reveal areas and interests. Keep them out of public repositories. The browser’s exported session logs can contain scanner names, frequencies and local filesystem paths.

Use `--data-dir /path/to/private-folder` consistently for the web server and MCP server to keep data elsewhere. Backups are diagnostic evidence, not a promise of complete restoration.

## Documentation

- [Agent start and MCP](docs/AGENT-START.md)
- [Plan format, CSV and source requirements](docs/PLAN-FORMAT.md)
- [Programming, recovery and troubleshooting](docs/OPERATING.md)
- [Architecture and protocol decisions](docs/ARCHITECTURE.md)
- [Hardware validation and compatibility](docs/COMPATIBILITY.md)
- [Contributing](CONTRIBUTING.md), [security and privacy](SECURITY.md), [license](LICENSE)

## Development

```sh
npm test
npm run check
npm run release:check
```

Tests use synthetic plans and an independent wire emulator. They do not require or access a physical scanner. Browser validation is described in [CONTRIBUTING.md](CONTRIBUTING.md). A user’s real logs or plans must never become test fixtures.

This project is not affiliated with or endorsed by Uniden. See [NOTICE](NOTICE) for protocol documentation and prior work.
