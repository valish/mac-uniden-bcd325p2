# Security and privacy

This is local software with access to scanner memory after a user grants a browser serial connection. It has no telemetry, model API, frequency-database credentials or remote command service.

The web server binds to 127.0.0.1. Do not expose it through a public tunnel, reverse proxy or 0.0.0.0 binding. Browser writes require the local origin and session token. MCP is a local stdio subprocess and has no hardware-control tool.

Private plans, receipts, snapshots and diagnostics belong under `.local/` or another explicitly configured private data directory. Do not commit them. An exported log can reveal location interests, channel labels and local paths. Review and minimize it before sharing. The assistant/client you choose has its own data handling; this project cannot make a cloud model private.

The app saves a diagnostic snapshot before writes and verifies afterward. It cannot make scanner programming atomic across power/cable loss and does not implement automatic restoration. An ambiguous allocation is stopped rather than retried.

During private development, report vulnerabilities privately to the repository owner through the access channel already used for the project. Do not post live credentials or unredacted scanner records in an issue. Public security reporting should be configured before the repository is made public.
