import fs from 'node:fs/promises';
import path from 'node:path';
import { schema, compilePlan, researchBrief } from './plan.mjs';
import { ROOT, DEFAULT_DATA } from './server.mjs';
import { Store } from './store.mjs';
const empty = { type: 'object', properties: {}, additionalProperties: false };
const input = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const argument = {
  plan: {
    type: 'object',
    description: 'A complete bcd325p2-plan-v1 document; use scanner_get_schema first.',
  },
};
const briefArgs = {
  type: 'object',
  properties: {
    areas: {
      type: 'string',
      description: 'City/county and state or region; no home address needed.',
    },
    interests: { type: 'string' },
    radius: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['areas'],
  additionalProperties: false,
};
const annotation = (readOnly = true) => ({
  readOnlyHint: readOnly,
  destructiveHint: false,
  idempotentHint: readOnly,
  openWorldHint: false,
});
export const tools = [
  {
    name: 'scanner_get_schema',
    description:
      'Get the BCD325P2 channel-plan JSON Schema and supported receive modes. Does not access hardware.',
    inputSchema: empty,
    annotations: annotation(),
  },
  {
    name: 'scanner_research_brief',
    description:
      'Generate an area-specific research brief. Use the agent’s own browsing tools to find current channels; this tool does not fetch a frequency database.',
    inputSchema: briefArgs,
    annotations: annotation(),
  },
  {
    name: 'scanner_validate_plan',
    description:
      'Validate and compile a channel plan without saving or connecting to a scanner. Returns field errors or counts, generated display labels, and research warnings.',
    inputSchema: input(argument),
    annotations: annotation(),
  },
  {
    name: 'scanner_stage_plan',
    description:
      'Save a validated channel plan to the local programmer’s review inbox. Does not upload to hardware. The user reviews it and starts programming in Chrome.',
    inputSchema: input(argument),
    annotations: annotation(false),
  },
  {
    name: 'scanner_list_plans',
    description: 'List locally staged plan summaries. These may contain private area names.',
    inputSchema: empty,
    annotations: annotation(),
  },
  {
    name: 'scanner_read_plan',
    description: 'Read a staged plan by the exact filename returned by scanner_list_plans.',
    inputSchema: input({ file: { type: 'string' } }),
    annotations: annotation(),
  },
  {
    name: 'scanner_session_history',
    description:
      'Read local backup, upload and verification summaries. A complete upload receipt, not validation, is evidence of hardware completion.',
    inputSchema: empty,
    annotations: annotation(),
  },
];
const resources = [
  { uri: 'scanner://schema/plan', name: 'BCD325P2 plan schema', mimeType: 'application/json' },
  {
    uri: 'scanner://guide/agent-start',
    name: 'Agent integration and research workflow',
    mimeType: 'text/markdown',
  },
  {
    uri: 'scanner://example/weather',
    name: 'Weather example (not for automatic upload)',
    mimeType: 'application/json',
  },
];
function checkedArguments(value, s) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Arguments must be an object');
  for (const k of s.required || [])
    if (!Object.hasOwn(value, k)) throw Error(`Missing argument ${k}`);
  for (const [k, v] of Object.entries(value)) {
    const expected = s.properties[k];
    if (!expected) throw Error(`Unknown argument ${k}`);
    if (
      expected.type === 'object'
        ? !v || typeof v !== 'object' || Array.isArray(v)
        : typeof v !== expected.type
    )
      throw Error(`Invalid argument ${k}`);
  }
  return value;
}
const result = (value) => ({
  content: [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
  ],
  ...(typeof value === 'object' ? { structuredContent: value } : {}),
  isError: false,
});
export class MCPServer {
  constructor(store) {
    this.store = store;
    this.state = 'new';
  }
  async tool(name, args) {
    const spec = tools.find((t) => t.name === name);
    if (!spec) throw Object.assign(Error('Unknown tool'), { rpcCode: -32602 });
    try {
      checkedArguments(args, spec.inputSchema);
      if (name === 'scanner_get_schema')
        return result({
          schema,
          supported: {
            model: 'BCD325P2',
            conventional: ['AM', 'FM', 'NFM', 'FMB', 'P25'],
            trunk: ['P25 Standard Phase I/II'],
            filters: 'Analog tone off; conventional P25 NAC search',
            hardwareWrite: 'User-operated browser only',
          },
        });
      if (name === 'scanner_research_brief') return result({ brief: researchBrief(args) });
      if (name === 'scanner_validate_plan') {
        const c = await compilePlan(args.plan);
        return result({ valid: true, ...c });
      }
      if (name === 'scanner_stage_plan')
        return result({
          staged: true,
          ...(await this.store.stage(args.plan)),
          next: 'Open the programmer, select the staged plan, review sources, then connect and program in Chrome.',
        });
      if (name === 'scanner_list_plans') return result({ plans: await this.store.plans() });
      if (name === 'scanner_read_plan') {
        if (!args.file.startsWith('plan-'))
          throw Error('Only staged plan files can be read by this tool');
        return result(await this.store.read(args.file));
      }
      if (name === 'scanner_session_history')
        return result({ records: await this.store.history() });
    } catch (e) {
      return {
        isError: true,
        content: [{ type: 'text', text: e.message }],
        structuredContent: { error: e.message, ...(e.issues ? { issues: e.issues } : {}) },
      };
    }
  }
  async dispatch(message) {
    const id = message?.id;
    const reply = (value) => ({ jsonrpc: '2.0', id, result: value });
    const error = (code, text) => ({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code, message: text },
    });
    if (
      !message ||
      Array.isArray(message) ||
      message.jsonrpc !== '2.0' ||
      typeof message.method !== 'string' ||
      (id !== undefined && typeof id !== 'string' && !Number.isInteger(id))
    )
      return error(-32600, 'Invalid JSON-RPC request');
    if (message.method === 'notifications/initialized' && id === undefined) {
      if (this.state === 'initializing') this.state = 'ready';
      return null;
    }
    if (id === undefined) return null;
    if (message.method === 'ping') return reply({});
    if (message.method === 'initialize') {
      if (this.state !== 'new') return error(-32600, 'Already initialized');
      if (typeof message.params?.protocolVersion !== 'string')
        return error(-32602, 'protocolVersion is required');
      const supported = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
      this.state = 'initializing';
      return reply({
        protocolVersion: supported.includes(message.params.protocolVersion)
          ? message.params.protocolVersion
          : supported[0],
        serverInfo: { name: 'mac-uniden-bcd325p2', version: '0.1.0' },
        capabilities: { tools: {}, resources: {}, prompts: {} },
        instructions:
          'Prepare source-checked BCD325P2 plans. This server stages files locally and never controls hardware. Read scanner://guide/agent-start. Use current sources through your own browsing tools.',
      });
    }
    if (this.state !== 'ready')
      return error(-32002, 'Initialize and send notifications/initialized first');
    const params = message.params || {};
    try {
      if (message.method === 'tools/list') return reply({ tools });
      if (message.method === 'tools/call')
        return reply(await this.tool(params.name, params.arguments || {}));
      if (message.method === 'resources/list') return reply({ resources });
      if (message.method === 'resources/templates/list') return reply({ resourceTemplates: [] });
      if (message.method === 'resources/read') {
        const resource = resources.find((r) => r.uri === params.uri);
        if (!resource) return error(-32602, 'Unknown resource');
        const text =
          resource.uri === 'scanner://schema/plan'
            ? JSON.stringify(schema, null, 2)
            : await fs.readFile(
                path.join(
                  ROOT,
                  resource.uri === 'scanner://guide/agent-start'
                    ? 'docs/AGENT-START.md'
                    : 'examples/weather.json',
                ),
                'utf8',
              );
        return reply({ contents: [{ uri: resource.uri, mimeType: resource.mimeType, text }] });
      }
      if (message.method === 'prompts/list')
        return reply({
          prompts: [
            {
              name: 'plan_listening_area',
              description: 'Research and prepare a source-checked BCD325P2 listening plan.',
              arguments: [
                { name: 'areas', description: 'City/county and state or region', required: true },
                { name: 'interests', description: 'Services or interests', required: false },
              ],
            },
          ],
        });
      if (message.method === 'prompts/get') {
        if (params.name !== 'plan_listening_area') return error(-32602, 'Unknown prompt');
        const brief = researchBrief(params.arguments);
        return reply({
          description: 'BCD325P2 area research workflow',
          messages: [{ role: 'user', content: { type: 'text', text: brief } }],
        });
      }
      return error(-32601, 'Method not found');
    } catch (e) {
      return error(e.rpcCode || -32602, e.message);
    }
  }
}
export async function runMCP({
  directory = DEFAULT_DATA,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  const service = new MCPServer(await new Store(directory).init());
  let buffer = '';
  const decoder = new TextDecoder();
  const send = (value) => {
    if (value) output.write(JSON.stringify(value) + '\n');
  };
  for await (const chunk of input) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) throw Error('MCP message exceeds 8 MB');
    let offset;
    while ((offset = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, offset).trim();
      buffer = buffer.slice(offset + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        continue;
      }
      send(await service.dispatch(message));
    }
  }
  if (buffer.trim())
    send({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Incomplete newline-delimited message' },
    });
}
