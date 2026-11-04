#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compilePlan, researchBrief, schema } from './plan.mjs';
import { importCSV } from './csv.mjs';
import { Store, readJSON } from './store.mjs';
import { ROOT, DEFAULT_DATA, startServer } from './server.mjs';
import { runMCP } from './mcp.mjs';
const help = `mac-uniden-bcd325p2 0.1.0\n\n  node src/cli.mjs serve [--open] [--port 8326] [--data-dir PATH]\n  node src/cli.mjs validate PLAN.json\n  node src/cli.mjs compile PLAN.json [--out FILE]\n  node src/cli.mjs stage PLAN.json [--data-dir PATH]\n  node src/cli.mjs import-csv CHANNELS.csv [--out FILE]\n  node src/cli.mjs brief --areas "City, County, State" [--interests TEXT]\n  node src/cli.mjs schema\n  node src/cli.mjs mcp [--data-dir PATH]\n  node src/cli.mjs agent-config [--data-dir PATH]\n  node src/cli.mjs history [--data-dir PATH]\n  node src/cli.mjs doctor\n\nNo external dependencies or API keys. Hardware access is through the local\nChrome interface. Data stays in .local/ unless --data-dir selects another folder.\n`;
function argumentsFor(argv) {
  let command = argv.shift() || 'help';
  if (['--help', '-h'].includes(command)) command = 'help';
  const args = [],
    options = {};
  const valued = new Set(['port', 'data-dir', 'out', 'areas', 'interests', 'radius', 'notes']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      args.push(a);
      continue;
    }
    const key = a.slice(2);
    if (key === 'open' || key === 'help') {
      options[key] = true;
      continue;
    }
    if (!valued.has(key) || argv[i + 1] === undefined || argv[i + 1].startsWith('--'))
      throw Error(`Unknown or incomplete option ${a}`);
    options[key] = argv[++i];
  }
  return { command, args, options };
}
async function output(value, out) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  if (out) {
    await fs.writeFile(out, text, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ file: path.resolve(out) }));
  } else process.stdout.write(text.endsWith('\n') ? text : text + '\n');
}
export async function main(argv = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw Error('Node.js 22 or newer is required');
  const { command, args, options } = argumentsFor([...argv]),
    directory = options['data-dir'] ? path.resolve(options['data-dir']) : DEFAULT_DATA;
  const requiredFile = () => {
    if (args.length !== 1) throw Error('Supply exactly one input file');
    return args[0];
  };
  if (command === 'help' || options.help) {
    process.stdout.write(help);
    return;
  }
  if (command === 'serve') {
    const port = options.port === undefined ? 8326 : Number(options.port);
    const running = await startServer({ port, directory });
    console.log(
      `BCD325P2 programmer: ${running.url}\nPrivate data: ${directory}\nKeep this process running while using the scanner. Control-C stops the server.`,
    );
    if (options.open) {
      const executable =
        process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? null : 'xdg-open';
      if (executable) {
        const child = spawn(
          executable,
          process.platform === 'darwin' ? ['-a', 'Google Chrome', running.url] : [running.url],
          { stdio: 'ignore' },
        );
        child.on('error', () => console.error('Open the printed URL in Chrome.'));
      }
    }
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => running.server.close(() => process.exit(0)));
    return;
  }
  if (command === 'mcp') {
    await runMCP({ directory });
    return;
  }
  if (command === 'schema') {
    await output(schema, options.out);
    return;
  }
  if (command === 'agent-config') {
    await output(
      {
        mcpServers: {
          'uniden-bcd325p2': {
            command: process.execPath,
            args: [path.join(ROOT, 'src/cli.mjs'), 'mcp', '--data-dir', directory],
          },
        },
      },
      options.out,
    );
    return;
  }
  if (command === 'doctor') {
    await output({
      node: process.version,
      nodeSupported: Number(process.versions.node.split('.')[0]) >= 22,
      platform: process.platform,
      root: ROOT,
      dataDirectory: directory,
      hardware: 'Not probed. Connect through Chrome Web Serial.',
      testedHardware: {
        model: 'BCD325P2',
        firmware: '1.11.11',
        platform: 'macOS 26.2 / Apple Silicon',
      },
      runtimeDependencies: [],
    });
    return;
  }
  if (command === 'brief') {
    await output(researchBrief(options), options.out);
    return;
  }
  if (command === 'history') {
    await output(await new Store(directory).history());
    return;
  }
  if (command === 'import-csv') {
    await output(importCSV(await fs.readFile(requiredFile(), 'utf8')), options.out);
    return;
  }
  if (['validate', 'compile', 'stage'].includes(command)) {
    const input = await readJSON(requiredFile());
    if (command === 'stage') {
      await output(await new Store(directory).stage(input));
      return;
    }
    const compiled = await compilePlan(input);
    await output(
      command === 'compile'
        ? compiled.plan
        : {
            valid: true,
            planId: compiled.plan.id,
            counts: compiled.plan.counts,
            warnings: compiled.warnings,
          },
      options.out,
    );
    return;
  }
  throw Error(`Unknown command ${command}. Run with --help.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(JSON.stringify({ error: e.message, ...(e.issues ? { issues: e.issues } : {}) }));
    process.exitCode = 1;
  });
