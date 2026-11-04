# Preparing a public release

The 0.1.0 candidate is experimental. Preparing source and pushing to a private repository do not publish it. A maintainer must explicitly approve the visibility change.

## Candidate checks

1. Run `npm test`, `npm run check` and `npm run release:check` on the exact candidate.
2. Run the browser check in [CONTRIBUTING.md](../CONTRIBUTING.md#browser-checks). Inspect desktop, 390-pixel and 320-pixel layouts and the print PDF. Refresh the three reviewed README screenshots.
3. Export the candidate tree into a clean directory. Repeat tests/checks and validate `examples/weather.json` with the CLI, without installing runtime packages. Confirm the launcher and local asset paths are included.
4. Review tracked files and every commit that will be public. Exclude personal plans, `.local/`, logs, receipts, addresses, phone numbers, vendor manuals, credentials and originating-workspace files. Scan commit messages and historical blobs as well as the current tree.
5. Check code and asset licensing in [NOTICE](../NOTICE) and [ASSETS.md](ASSETS.md). Keep the IBM font license with the WOFF2 files.
6. Verify the GitHub CI matrix and record hardware evidence accurately in [COMPATIBILITY.md](COMPATIBILITY.md).

`package.json` stays `private: true` because the distribution is a GitHub checkout/archive, not an npm package. The runtime has no external packages, CDN assets or model service dependency.

## Hardware scope for this candidate

The standalone application has physically backed up, rewritten and verified an existing 11-system plan. It has **not** physically exercised its new-record allocation path. Simulated tests cover allocation, partial uploads, mismatched records and timeout handling; those are not equivalent to hardware tests.

Before claiming a complete first-install hardware test, use a deliberately small, source-checked plan on the supported device, preserve unrelated records and confirm the saved configuration in a new session. Do not erase a user’s scanner to obtain a clean test. Record counts and environment, not private logs. Received audio and physical cable/power-loss recovery require separate evidence.

An experimental public preview must retain these limitations prominently in the README. Do not describe the candidate as broadly hardware-validated or production-ready.

## Publication decision

After reviewing the candidate, the maintainer can approve a public experimental preview or wait for the additional hardware test. Changing GitHub visibility is a separate action from the checks above. Review repository access and enable GitHub private vulnerability reporting when making the repository public. Keep the local service bound to loopback; this software does not need public hosting.

Suggested repository description:

> Local Uniden BCD325P2 programmer for macOS using Chrome Web Serial, portable channel plans, CLI and MCP. Experimental; no Windows VM required.

Suggested topics: `uniden`, `bcd325p2`, `macos`, `scanner`, `web-serial`, `p25`, `mcp`.

Use [CHANGELOG.md](../CHANGELOG.md) for the release description. Tag a release only after the exact candidate and its limitations are approved. Do not upload private evidence or the originating preparedness workspace as a release asset.
