# Channel plan format

Portable input uses `format: "bcd325p2-plan-v1"`. The authoritative structural schema is [plan.schema.json](../schemas/plan.schema.json); `src/plan.mjs` adds semantic checks and compiles it into scanner records. Unknown properties are rejected so misspellings do not silently discard settings.

## Minimal conventional plan

```json
{
  "format": "bcd325p2-plan-v1",
  "title": "My researched listening plan",
  "namespace": "MU",
  "areas": ["My city and state"],
  "researchDate": "2026-11-03",
  "sources": [],
  "systems": [
    {
      "name": "Weather",
      "type": "CNV",
      "quickKey": 90,
      "enabled": true,
      "groups": [
        {
          "name": "NOAA",
          "quickKey": 1,
          "channels": [{ "name": "NOAA 162.550", "frequencyMHz": "162.5500", "mode": "FM" }]
        }
      ]
    }
  ]
}
```

This illustrates structure; it is not a claim that this transmitter is receivable at a particular address. Validation warns when entries have no linked source. Use `examples/weather.json` for a preview-only example with a reference.

## Names, namespace and quick keys

- Names in the source plan can be up to 80 characters. The compiler produces unique 16-character ASCII scanner labels and keeps full names for review/print.
- `namespace` is 2–4 uppercase alphanumeric characters, beginning with a letter. It prefixes generated system labels and distinguishes the plan’s systems. Choose another namespace when intentionally appending a separate plan.
- System quick keys are unique integers 0–99. Group keys are 0–9; groups may share a key. Existing occupied keys are preserved and new assignments may change, so use the **actual** mapping after upload.
- `enabled` controls initial system selection. The browser can override selection for an upload without editing the source plan.
- A changed configuration receives a new fingerprint. The uploader appends or resumes a matching receipt; it is not an arbitrary editor for systems installed under an older plan.

## Conventional records

Use `type: "CNV"`, groups, and channels containing `name`, `frequencyMHz`, and `mode`.

| Mode  | Programming                                |
| ----- | ------------------------------------------ |
| `AM`  | Analog Only, AM                            |
| `FM`  | Analog Only, FM                            |
| `NFM` | Analog Only, narrow FM                     |
| `FMB` | Analog Only, broadcast FM                  |
| `P25` | Conventional Digital Only, NFM, NAC Search |

`frequencyMHz` is a decimal string, not an integer number of hertz or an eight-digit wire value. Four decimal places are normal; a fifth digit of 0 or 5 can represent 6.25 kHz channel centers. Uniden’s wire protocol has 100 Hz notation; the compiler truncates the fifth decimal consistently with the published band tables. Confirm scanner readback when using unusual channel spacing.

The compiler accepts receive bands 25–511.9999, 758–823.9999, 849.0125–868.9999 and 894.0125–960 MHz (inclusive). Hardware may further normalize a channel center or reject a particular setting; readback stops on a mismatch.

Analog tone restrictions are off and conventional P25 uses NAC Search. Put published CTCSS/DCS/NAC details in `notes`; this version does not apply fixed filters. It never converts a transmit/repeater input into an output automatically.

## P25 Standard records

Use `type: "P25S"`. Channels contain `name` and decimal `tgid` (1–65535), with `encryption: "clear"` when confirmed. `unknown` or an omitted encryption status generates a warning. Encrypted-only entries belong in `excluded`, not the active plan.

A P25 system must also contain `sites`. Each site has `name` and `frequencies`, an array of decimal MHz strings. Use the relevant published control/alternate frequencies for that site. Talkgroups do not contain per-channel frequencies or conventional modes.

```json
{
  "name": "Regional P25",
  "type": "P25S",
  "quickKey": 6,
  "enabled": false,
  "groups": [
    {
      "name": "Public services",
      "quickKey": 1,
      "channels": [{ "name": "Example talkgroup", "tgid": 101, "encryption": "unknown" }]
    }
  ],
  "sites": [{ "name": "Example site", "frequencies": ["851.0125"] }]
}
```

This P25 fragment is synthetic syntax, not a real system recommendation. Research actual sites and IDs before use. P25 Phase II slot selection follows system signaling; this app does not manually select a slot. ID Scan uses the supplied talkgroups.

## Evidence and exclusions

Each source has `id`, `title`, `url` and `checked` (YYYY-MM-DD). Channels and sites link to sources through `sourceIds`. Keep dates truthful. `researchDate` describes the plan’s research date; it does not replace individual source checks.

`areas`, plan/system/channel/site `notes`, and `excluded` explain relevance and uncertainty. An excluded record requires `name` and `reason`, and may include source IDs and notes. Examples include encryption, unsupported trunking, outdated listings or coverage uncertainty that makes the channel unsuitable for the selected plan.

A top-level `example: true` blocks hardware programming. Remove or set it false only after adapting and reviewing the example. Structural validation cannot independently authenticate frequencies or sources.

## Conventional CSV

Required columns:

```csv
system,group,name,frequency_mhz,mode,quick_key,group_key,enabled
```

Optional columns: `source_url,source_title,checked`. A source URL requires a checked date. `enabled` is `true` or `false`. Settings must agree across rows belonging to the same system/group. Quoted commas, escaped quotes and multiline fields are supported. Unknown headers are errors.

CSV is conventional-only. Use JSON for sites, talkgroups, multiple source links, notes and exclusions. Spreadsheet formula-leading text is escaped on CSV export. The UI exports the portable JSON source document and prints a complete channel reference.

## Capacity

The planner checks 500 systems, 1,000 internal sites (including one per conventional system), 256 trunk sites per system, 20 groups per system, 1,000 conventional channels or 500 talkgroups per group, and 25,000 total channel/frequency records. The scanner’s existing memory is checked before allocation. A plan that fits by itself may not fit alongside existing systems.
