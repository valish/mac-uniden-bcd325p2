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

The standalone application adds a new plan compiler, CSV import, browser interface, Node server and MCP integration. Synthetic coverage and the standalone hardware reapplication test are recorded separately below.

| Environment                                                 | Status                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| BCD325P2 1.11.11 / original core / macOS 26.2 Apple Silicon | Physical upload and saved readback confirmed                                              |
| Standalone protocol/transport                               | Automated wire/stream regression tests                                                    |
| Standalone source plans, local service and MCP              | See current automated test results                                                        |
| Standalone browser UI                                       | Chromium 156.0.8078.4 simulated workflow passed; desktop/mobile and print output reviewed |
| Standalone physical reapplication of existing records       | Backup, all writes, finalization and fresh-session readback passed on BCD325P2 1.11.11    |
| Standalone allocation of new records on hardware            | Not exercised by the reapplication test; still requires physical validation               |
| Other firmware / Intel Macs / other OSes                    | Unverified                                                                                |
| Other scanner models                                        | Rejected; unsupported                                                                     |

On November 3, 2026 (local time), the standalone application passed 43 automated tests. A separate headless Chromium run passed plan import, agent brief/configuration, example-upload blocking, review gating, simulated upload and readback, stop/retry, session-log preservation after disconnection, saved records and unfiltered printing. Desktop and 390-pixel mobile screenshots and the printable reference were inspected. The browser run used an isolated synthetic Web Serial device and did not access a physical scanner.

A clean source archive also passed syntax/schema/documentation checks, the release privacy audit and CLI plan validation without installing runtime packages. GitHub CI passed on macOS and Ubuntu with Node 22 and 24.

The public-preview interface refinement in revision `ddc2587` was checked separately in Chromium 156.0.8078.4: all five views fit a 320-pixel viewport, the 390-pixel and desktop layouts were inspected, bundled fonts loaded locally, the keyboard skip link worked, and On/Off scan states remained visible in the printed reference. README captures use only the weather example and synthetic data. That refinement did not change the plan compiler, scanner protocol or serial transport; it did not extend the physical-device claims below.

The subsequent public-repository review added regression coverage for recovery with all quick keys occupied, keys shared with unrelated systems, duplicate managed names, malformed memory counts and per-system channel limits. The suite now contains 49 passing automated tests. A further Chromium run passed on November 3, 2026 at 11:11 p.m. Eastern, including blocked scanner operations while a replacement plan loads and visible system/channel/site notes in review, search and print. Desktop, 390-pixel and 320-pixel layouts and the printable reference were inspected. These validation and recovery changes have not received a new physical-device test; the physical evidence remains tied to the revision below. The existing private plan still compiles to the same fingerprint and record counts.

## Standalone physical reapplication

On November 3, 2026, at 10:19 p.m. Eastern, standalone revision `d1ecbe0dfa136d57cd5d62c59614540d1d253345` successfully reapplied the existing plan on the same BCD325P2, firmware 1.11.11, through desktop Chrome on the Mac.

The existing source plan was converted to the portable format with exact equality of scanner labels, receive settings, frequencies, talkgroups, groups, sites and preferred keys. All 290 original source records were accounted for. The standalone app first read the physical scanner and verified the installed plan. A private, one-time migration helper then prepared a receipt using those verified memory handles so the existing records could be reused for this test. This migration helper is not a general import or restore feature in the application.

The subsequent user-operated **Back up & program** run saved a pre-write snapshot, issued 247 conventional-channel setters, 28 talkgroup setters and 15 site-frequency setters, finalized listening keys, and read the complete configuration in a fresh session. Three programming sessions each ended with an acknowledged `EPG,OK`. The completed receipt and final snapshot were independently checked against the compiled plan. All 11 systems retained their configuration, no records were allocated or deleted, and the recovery ticket cleared after completion. Personal source data, snapshots and transcripts remain private.

This is physical evidence for the standalone read, rewrite, finalization and verification path. It does not exercise allocation of new records, recovery from a physical cable/power failure, or received audio. Test a fresh installation with the standalone app before publishing a broader hardware-support claim. Reapplication was performed through verified-handle migration; the ordinary duplicate-install guard remains in place.

## Reporting a hardware test

Report scanner model/firmware, macOS version/architecture, browser version, cable/adapter type, operation, counts and whether full readback completed. Distinguish saved configuration from actual received audio.

For a failure, first inspect the transcript privately. Share the minimal command/response needed to reproduce the issue. Remove personal names, locations, local paths and unrelated scanner records. A synthetic regression fixture is preferable to uploading a full snapshot.

Do not advertise a green simulation test as a successful physical upload. Document known limitations beside the relevant feature.
