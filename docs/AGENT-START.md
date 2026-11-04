# Prepare a BCD325P2 plan with your preferred agent

Choose the integration your assistant supports. All routes use the same schema and validator. The programmer does not choose or call a language model.

## Route 1: chat and files

In the browser, open **Prepare with an agent**. Enter cities/counties and a state or region, listening interests, and any travel areas. Copy the generated brief to your assistant, together with access to this project or its schema and guide.

The assistant returns a JSON plan. Save it and use **Import a plan**. If the assistant cannot browse, ask it to work only from supplied references and record unverified entries; do not let it imply current research occurred.

Browser-only chat products do not need local MCP support. Their output file is the handoff.

## Route 2: an agent with terminal access

```sh
node src/cli.mjs brief --areas "City, County, State" --interests "Fire, EMS, amateur repeaters, weather"
node src/cli.mjs schema
node src/cli.mjs validate /path/to/plan.json
node src/cli.mjs stage /path/to/plan.json
```

Validation returns JSON with counts, a configuration fingerprint and warnings. Invalid plans exit with a nonzero status and field paths. `compile` produces the internal wire-ready plan for inspection; import and stage use the portable source plan, not compiled output.

`--out FILE` creates a new file and refuses to overwrite an existing one. `stage` saves a private copy under `.local/` and returns its record name. Start the UI with `npm start`, then refresh the inbox. Staging does not connect to a scanner.

## Route 3: a local MCP client

This server uses standard newline-delimited JSON-RPC over **stdio**. It supports tools, resources and a research prompt. It does not expose an HTTP MCP endpoint or manage LLM credentials.

```sh
node src/cli.mjs agent-config
```

Merge the generated `mcpServers` entry into a client that accepts local stdio servers. Some clients use a different configuration wrapper; preserve the generated executable and argument array when translating it. Use an absolute Node executable path because desktop clients may not inherit the terminal’s PATH. The browser’s agent screen also displays this configuration.

The equivalent command is:

```sh
node /absolute/path/mac-uniden-bcd325p2/src/cli.mjs mcp --data-dir /absolute/path/private-data
```

Launch the web UI with the same `--data-dir`. Without this option both processes use the repository’s `.local/`. The MCP server writes only protocol messages to stdout; errors go to stderr. It can be stopped by closing stdin or terminating its process.

| Tool                      | Effect                                                   |
| ------------------------- | -------------------------------------------------------- |
| `scanner_get_schema`      | Returns source-plan JSON Schema and supported modes      |
| `scanner_research_brief`  | Creates a brief for the requested areas; does not browse |
| `scanner_validate_plan`   | Checks and compiles a plan without saving                |
| `scanner_stage_plan`      | Saves a validated plan into the local review inbox       |
| `scanner_list_plans`      | Lists staged plan summaries                              |
| `scanner_read_plan`       | Reads a specific staged plan filename                    |
| `scanner_session_history` | Reads local backup/upload/verification summaries         |

Resources: `scanner://schema/plan`, `scanner://guide/agent-start`, `scanner://example/weather`.

Prompt: `plan_listening_area`, with required `areas` and optional `interests` arguments.

The client’s own research tools supply web access. The MCP server never sends scanner commands. Only the user-operated browser has the serial port.

## Research that produces a useful plan

1. Confirm the geographic areas and services. Include nearby family or travel areas when requested. State where terrain or distance makes reception uncertain.
2. Check current agency/county communications information, official system information, weather transmitters, and amateur club/repeater resources. Compare credible frequency directories when useful; retain their source terms and attribution. A listing alone does not prove a channel is still active.
3. Separate conventional analog, conventional P25 and P25 Standard trunking. For trunking, identify sites and control/alternate frequencies separately from decimal talkgroups. Use published clear talkgroups; mark uncertain encryption status. Exclude encrypted-only or unsupported services with reasons.
4. Use receive/repeater-output frequencies. Include service purpose and source IDs. Do not present private radio operators as dependable emergency contacts or imply that a named person will be on air.
5. Keep the initial scan set focused. Continuous NOAA/FM broadcasts should normally be separate and initially disabled. Include amateur, interoperability, travel and other services when relevant to the request, rather than filling memory indiscriminately.
6. Validate, correct, stage, and explain meaningful warnings. The source date is when the source was actually checked, not a timestamp invented by a model. Do not claim research from a tool that was unavailable.
7. Direct the user to review and program. A completed receipt plus final snapshot establishes saved configuration; reception requires listening.

## Boundaries

No API keys are required by this project. Your chosen assistant may send the brief and tool results to its own service. Plans and session summaries can reveal location interests; share only the needed details.

The validator checks structure and supported values, not whether a source is truthful or a transmitter is receivable. It does not defeat encryption, apply fixed CTCSS/DCS/NAC filters, or program unsupported trunk types. Read the [plan reference](PLAN-FORMAT.md) and [operating guide](OPERATING.md) when those distinctions affect the task.
