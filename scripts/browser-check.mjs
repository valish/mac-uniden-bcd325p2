// Development-only smoke/visual check. Uses synthetic serial data, never hardware.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { startServer, ROOT } from '../src/server.mjs';
import { Radio } from '../tests/radio.mjs';
const moduleName = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(moduleName ? pathToFileURL(moduleName).href : 'playwright');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bcd325p2-browser-'));
const artifacts = path.join(ROOT, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
let running, browser;
const errors = [];
try {
  running = await startServer({ port: 0, directory });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript({
    content: `
  const assert={ok(value,message){if(!value)throw Error(message||'emulator assertion');}};
  const quickPosition=key=>[Math.floor(key/10),(key%10+9)%10];
  ${Radio.toString()}
  const radio=new Radio();radio.next=0;window.__testRadio=radio;
  const port={getInfo:()=>({usbVendorId:0x1965,usbProductId:0x001a}),
    async open(){this.readable=new ReadableStream({start:controller=>{this.controller=controller;}});this.writable=new WritableStream({write:async bytes=>{const command=new TextDecoder().decode(bytes).replace(/\\r$/,'');const response=await radio.exchange(command);this.controller.enqueue(new TextEncoder().encode(response+'\\r'));}});},
    async setSignals(){},async close(){}
  };
  Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port},configurable:true});
 `,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(running.url);
  await page.locator('#inbox').getByText('Agent inbox is empty.', { exact: false }).waitFor();
  await page.screenshot({ path: path.join(artifacts, '01-start-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Prepare with your agent', exact: true }).click();
  await page.locator('[name=areas]').fill('Example County, Pennsylvania');
  await page.getByRole('button', { name: 'Build research brief' }).click();
  assert.ok(
    (await page.locator('#brief-text').textContent()).includes('Example County, Pennsylvania'),
  );
  assert.ok((await page.locator('#mcp-config').textContent()).includes('mcpServers'));
  await page.screenshot({ path: path.join(artifacts, '02-agent-desktop.png'), fullPage: true });
  await page.locator('[data-view=plan]').click();
  await page.locator('#example').click();
  await page.locator('#plan-title').getByText('NOAA weather example', { exact: true }).waitFor();
  await page.locator('#reviewed').check();
  await page.locator('[data-view=scanner]').click();
  await page.locator('#connect').click();
  await page.locator('#connection-chip.connected').waitFor();
  assert.equal(await page.locator('#program').isDisabled(), true);
  await page.locator('[data-view=plan]').click();
  const synthetic = await fs.readFile(path.join(ROOT, 'tests/fixtures/plan.json'));
  await page.locator('#file').setInputFiles({
    name: 'synthetic-plan.json',
    mimeType: 'application/json',
    buffer: synthetic,
  });
  await page
    .locator('#plan-title')
    .getByText('Synthetic protocol test plan', { exact: true })
    .waitFor();
  await page.locator('#filter').fill('Digital test');
  assert.equal(await page.locator('#channel-list tbody tr').count(), 1);
  await page.locator('#filter').fill('');
  await page.locator('#reviewed').check();
  await page.screenshot({ path: path.join(artifacts, '03-plan-desktop.png'), fullPage: true });
  await page.locator('[data-view=scanner]').click();
  assert.equal(await page.locator('#program').isEnabled(), true);
  await page.locator('#program').click();
  await page.waitForFunction(
    () => document.querySelector('#scanner-status').textContent.startsWith('Upload verified'),
    {},
    { timeout: 20000 },
  );
  await page.locator('#verify').click();
  await page.waitForFunction(() =>
    document.querySelector('#scanner-status').textContent.startsWith('Installed plan verified'),
  );
  assert.equal(await page.evaluate(() => window.__testRadio.systems.length), 2);
  await page.screenshot({ path: path.join(artifacts, '04-scanner-desktop.png'), fullPage: true });
  // Stop a read operation once, then ensure another backup can start normally.
  await page.evaluate(() => {
    const radio = window.__testRadio;
    const exchange = radio.exchange.bind(radio);
    let stopped = false;
    radio.exchange = async (command) => {
      const reply = await exchange(command);
      if (command === 'SIH' && !stopped) {
        stopped = true;
        document.querySelector('#stop').click();
      }
      return reply;
    };
  });
  await page.locator('#backup').click();
  await page.waitForFunction(() =>
    document.querySelector('#scanner-status').textContent.includes('Stopped by user'),
  );
  await page.locator('#backup').click();
  await page.waitForFunction(
    () => document.querySelector('#scanner-status').textContent === 'Saved 2 existing systems.',
  );
  await page.locator('#disconnect').click();
  await page.waitForFunction(
    () => document.querySelector('#scanner-status').textContent === 'Disconnected.',
  );
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download-log').click();
  const logFile = await (await downloadEvent).path();
  const log = JSON.parse(await fs.readFile(logFile, 'utf8'));
  assert.ok(log.transcript.length > 0, 'disconnection must retain the session log');
  await page.locator('[data-view=records]').click();
  await page.getByRole('heading', { name: 'Upload · complete', exact: true }).waitFor();
  await page.locator('[data-view=plan]').click();
  await page.locator('#filter').fill('Digital test');
  assert.equal(await page.locator('#sources-panel').getAttribute('open'), null);
  // Native print events must expand the full reference, even with a screen filter.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  assert.equal(await page.locator('#channel-list tbody tr').count(), 6);
  assert.equal(await page.locator('#sources-panel').evaluate((node) => node.open), true);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: path.join(artifacts, 'field-reference.pdf'),
    format: 'Letter',
    printBackground: true,
    margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
  });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  assert.equal(await page.locator('#filter').inputValue(), 'Digital test');
  assert.equal(await page.locator('#channel-list tbody tr').count(), 1);
  await page.emulateMedia({ media: 'screen' });
  await page.locator('#filter').fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, '05-plan-mobile.png'), fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'mobile horizontal overflow',
  );
  await page.locator('[data-view=agent]').click();
  await page.screenshot({ path: path.join(artifacts, '06-agent-mobile.png'), fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'agent mobile horizontal overflow',
  );
  assert.deepEqual(errors, []);
  const report = {
    status: 'passed',
    at: new Date().toISOString(),
    browser: await browser.version(),
    checks: [
      'empty state',
      'area brief',
      'MCP configuration',
      'example upload blocked',
      'JSON import',
      'channel filter',
      'review gating',
      'simulated upload',
      'saved verification',
      'stop and start another backup',
      'session log survives disconnect',
      'session records',
      'unfiltered print PDF and restored screen filter',
      'desktop/mobile layout',
      'no page errors',
    ],
    hardware: 'Not accessed; synthetic Web Serial emulator only',
  };
  await fs.writeFile(
    path.join(artifacts, 'browser-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  await fs.writeFile(
    path.join(artifacts, 'browser-report.json'),
    JSON.stringify(
      { status: 'failed', at: new Date().toISOString(), error: e.message, errors },
      null,
      2,
    ) + '\n',
  );
  throw e;
} finally {
  await browser?.close();
  if (running) await new Promise((resolve) => running.server.close(resolve));
  await fs.rm(directory, { recursive: true, force: true });
}
