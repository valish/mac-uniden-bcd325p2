# Compatibility and validation evidence

## Original protocol core

On November 3, 2026, the original local programmer completed a physical upload and a fresh-session readback on:

- Uniden BCD325P2, firmware 1.11.11
- macOS 26.2, Apple Silicon Mac
- Desktop Google Chrome, Web Serial through the existing macOS USB serial driver
- USB vendor 0x1965, product 0x001a

The completed configuration contained 11 systems, 247 conventional channels, 28 P25 talkgroups, five P25 sites and 15 site frequencies. Final verification included names, receive settings, group/system keys and system/site lockouts. The private receipt and snapshots are intentionally not distributed.

That establishes this protocol path on one device. It does not establish reception, simulcast performance, compatibility with every firmware, or validation of a later code change.

## Generalized application

The standalone application adds a new plan compiler, CSV import, browser interface, Node server and MCP integration. These are tested with synthetic fixtures and must be distinguished from the original-core hardware run.

| Environment                                                 | Status                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| BCD325P2 1.11.11 / original core / macOS 26.2 Apple Silicon | Physical upload and saved readback confirmed                                              |
| Standalone protocol/transport                               | Automated wire/stream regression tests                                                    |
| Standalone source plans, local service and MCP              | See current automated test results                                                        |
| Standalone browser UI                                       | Chromium 156.0.8078.4 simulated workflow passed; desktop/mobile and print output reviewed |
| Standalone complete physical-device workflow                | Requires a separate hardware run before claiming it tested                                |
| Other firmware / Intel Macs / other OSes                    | Unverified                                                                                |
| Other scanner models                                        | Rejected; unsupported                                                                     |

On November 3, 2026 (local time), the standalone application passed 43 automated tests. A separate headless Chromium run passed plan import, agent brief/configuration, example-upload blocking, review gating, simulated upload and readback, stop/retry, session-log preservation after disconnection, saved records and unfiltered printing. Desktop and 390-pixel mobile screenshots and the printable reference were inspected. The browser run used an isolated synthetic Web Serial device and did not access a physical scanner.

A clean source archive also passed syntax/schema/documentation checks, the release privacy audit and CLI plan validation without installing runtime packages. These results cover the private prototype; the complete standalone physical-device workflow remains a public-release prerequisite.

## Reporting a hardware test

Report scanner model/firmware, macOS version/architecture, browser version, cable/adapter type, operation, counts and whether full readback completed. Distinguish saved configuration from actual received audio.

For a failure, first inspect the transcript privately. Share the minimal command/response needed to reproduce the issue. Remove personal names, locations, local paths and unrelated scanner records. A synthetic regression fixture is preferable to uploading a full snapshot.

Do not advertise a green simulation test as a successful physical upload. Document known limitations beside the relevant feature.
