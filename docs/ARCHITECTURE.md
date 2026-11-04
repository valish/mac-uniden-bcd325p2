# Architecture and protocol decisions

## Components

| Path                | Responsibility                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/schema.mjs`    | Source-plan structural contract; exported JSON Schema is generated from it                                         |
| `src/plan.mjs`      | Semantic validation, source links, frequency conversion, display labels, configuration fingerprint, research brief |
| `src/csv.mjs`       | Conventional CSV input and export                                                                                  |
| `src/protocol.mjs`  | Scanner identification, snapshot traversal, allocation, programming, recovery and verification                     |
| `src/transport.mjs` | Browser Web Serial transport with CR framing, one outstanding command and bounded timeouts                         |
| `src/store.mjs`     | Private durable records, staged plans, history and recovery receipt lookup                                         |
| `src/server.mjs`    | Loopback-only browser service with an explicit static-file allowlist and protected writes                          |
| `src/mcp.mjs`       | Local stdio MCP tools, resources and research prompt; no hardware transport                                        |
| `src/cli.mjs`       | Local launch, validation, compilation, staging and agent configuration                                             |
| `web/`              | Plan review, agent brief, connection workflow, session history and print reference                                 |
| `tests/radio.mjs`   | Independent wire emulator with fixed protocol offsets and observed firmware behavior                               |

The runtime has no third-party packages. The UI imports native ECMAScript modules. MCP and CLI share the same compiler. Private files are stored outside tracked source under `.local/` by default.

## Plan boundary

A portable source plan keeps full names, human-readable decimal MHz, source citations and exclusions. The compiler generates scanner labels and wire frequencies, then checks the internal plan against the programming engine’s invariants. Its SHA-256-derived identifier covers the compiled configuration, including initial defaults. Source URLs and notes do not authorize device commands.

A staged plan is a proposal. Browser review and device selection are required before upload. The MCP server has no serial device tool. Plans cannot contain raw protocol commands or filesystem destinations.

## Wire invariants

Uniden’s request and response field positions differ. `maps` in `protocol.mjs` stores both explicitly. Responses are comma-separated ASCII terminated by CR. The transport permits one outstanding request, so the next command cannot overtake the previous acknowledgment.

- Index **0** is a valid allocation handle on firmware 1.11.11; **-1** denotes list termination or allocation failure. Linked lists need cycle and length checks.
- A setter returning `OK` does not replace readback. Frequency and decimal TGID comparisons tolerate equivalent numeric formatting, while applicable receive settings remain strict.
- Conventional Digital Only channels leave analog tone fields reserved. P25 Standard site modulation/control-channel-only fields and the talkgroup audio selector are inapplicable. The implementation omits these fields rather than accepting any blank response.
- The observed firmware could return a stale quick-key map immediately after newly populated systems. Memory writing, listening-state finalization and final verification therefore use separate acknowledged programming sessions.
- MEM counts a conventional system’s internal site. Capacity calculations include those sites and subtract records reused during resume.
- QSL order is 1–9,0 within each ten-key page. QGL uses the same digit order. Actual allocated quick keys may differ from preferred keys.
- Unrelated existing systems and selected global settings are compared after upload. Structural links may change when systems are appended; receive settings must not.

The code implements no erase, delete, reset, firmware upload or unrestricted raw-command endpoint. A transport timeout stops the operation and does not retry an allocation whose effect is unknown.

## Durability and recovery

Before memory allocation, the app must save and verify a snapshot on disk. Receipts record system handles as allocation progresses. Writes use private temporary files, fsync, rename, directory sync and readback. The final snapshot and completed receipt remain available for inspection.

On retry, the server derives a recovery ticket from a matching incomplete receipt. Only recorded systems whose current content matches a prefix of the plan can be resumed. Unknown, changed or ambiguously allocated content stops the attempt. Completed receipts suppress automatic recovery for that plan.

The app is append/resume oriented. It is not a transactional scanner filesystem, and power or cable loss can leave partial records. The raw backup has no automated restore implementation.

## Local trust boundary

The HTTP service binds only to 127.0.0.1, checks Host, requires same-origin plus a random session token for mutations, limits request sizes and serves an explicit asset list. User data is rendered as text, not injected markup. There are no external scripts, fonts or analytics.

MCP is a local subprocess using newline-delimited JSON-RPC. Its configured data directory is its file boundary. Tools can stage plans and inspect local summaries; they cannot issue scanner commands, fetch arbitrary URLs, read arbitrary paths or execute shell commands.

## Source documents

- [Uniden BCD325P2 Remote Protocol v1.02](https://info.uniden.com/twiki/pub/UnidenMan4/BCD325P2FirmwareUpdate/BCD325P2_Remote_Protocol_ver_1_02.pdf)
- [Uniden BCD325P2 owner manual](https://www.uniden.info/download/ompdf/BCD325P2om.pdf)
- [Chrome Web Serial](https://developer.chrome.com/docs/capabilities/serial)
- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)

The published protocol’s one-based index description differs from observed firmware behavior. Tests preserve that observed zero-handle behavior without publishing a user’s full scanner records.
