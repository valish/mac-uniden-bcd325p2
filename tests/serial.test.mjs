import test from 'node:test';
import assert from 'node:assert/strict';
import { SerialTransport } from '../src/transport.mjs';
import { Programmer } from '../src/protocol.mjs';

function fakePort(onWrite = () => {}) {
  const port = {
    writes: [],
    closeCount: 0,
    openCount: 0,
    getInfo: () => ({ usbVendorId: 0x1965, usbProductId: 0x001a }),
    async open(options) {
      this.openCount++;
      this.options = options;
    },
    async setSignals(signals) {
      this.signals = signals;
    },
    async close() {
      assert.equal(this.readable.locked, false);
      assert.equal(this.writable.locked, false);
      this.closeCount++;
    },
    feed(text) {
      this.controller.enqueue(new TextEncoder().encode(text));
    },
  };
  port.readable = new ReadableStream({
    start(controller) {
      port.controller = controller;
    },
  });
  port.writable = new WritableStream({
    write(bytes) {
      const text = new TextDecoder().decode(bytes);
      port.writes.push(text);
      return onWrite(text, port);
    },
  });
  return port;
}

test('Web Serial identifies the scanner using the OS port without raw USB claims', async () => {
  const port = fakePort((text, p) => {
    if (text === 'MDL\r') {
      p.feed('MDL,BCD');
      p.feed('325P2\r');
    } else if (text === 'VER\r') p.feed('VER,Version 1.11.07\r');
    else assert.fail('Identification must not program memory');
  });
  const transport = new SerialTransport(port);
  await transport.open();
  const programmer = new Programmer(transport, {
    save: async () => assert.fail('Identification must not save or write configuration'),
  });
  assert.deepEqual(await programmer.identify(), { model: 'BCD325P2', firmware: 'Version 1.11.07' });
  assert.deepEqual(port.writes, ['MDL\r', 'VER\r']);
  assert.equal(port.options.baudRate, 115200);
  assert.equal(port.options.flowControl, 'none');
  assert.deepEqual(port.signals, { dataTerminalReady: true, requestToSend: true });
  await transport.close();
  assert.equal(port.closeCount, 1);
});

test('serial timeout does not retry allocations and releases the port', async () => {
  const port = fakePort(),
    transport = new SerialTransport(port, { timeout: 15 });
  await transport.open();
  await assert.rejects(transport.exchange('CSY,CNV,0'), /No response to CSY/);
  await transport.close();
  assert.deepEqual(port.writes, ['CSY,CNV,0\r']);
  assert.equal(port.closeCount, 1);
});

test('serial write failure and unplug each stop the request and release stream locks', async () => {
  for (const failure of ['write', 'unplug']) {
    const port = fakePort(() => {
      if (failure === 'write') throw Error('write failed');
    });
    const transport = new SerialTransport(port);
    await transport.open();
    const response = transport.exchange('MDL');
    if (failure === 'unplug') port.controller.error(Error('device removed'));
    await assert.rejects(response, /write failed|device removed/);
    await transport.close();
    assert.equal(transport.closed, true);
    assert.equal(port.closeCount, 1);
  }
});

test('serial transport permits one request at a time and rejects injection', async () => {
  const port = fakePort(),
    transport = new SerialTransport(port);
  await transport.open();
  await assert.rejects(transport.exchange('MDL\rCLR'), /framing/);
  const response = transport.exchange('MDL');
  await assert.rejects(transport.exchange('VER'), /one scanner command/);
  port.feed('MDL,BCD325P2\r');
  assert.equal(await response, 'MDL,BCD325P2');
  await transport.close();
  assert.deepEqual(port.writes, ['MDL\r']);
});

test('user disconnect cancels a pending serial read and closes exactly once', async () => {
  const port = fakePort(),
    transport = new SerialTransport(port);
  await transport.open();
  const response = transport.exchange('MDL');
  const rejected = assert.rejects(response, /disconnected/);
  await Promise.all([transport.close(), transport.close(), rejected]);
  assert.equal(port.closeCount, 1);
});

test('chooser filters the observed Uniden ID and does not close a port opened elsewhere', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let filters;
  const port = fakePort();
  port.open = async () => {
    throw Error('port busy');
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serial: {
        requestPort: async (options) => {
          filters = options.filters;
          return port;
        },
      },
    },
  });
  try {
    await assert.rejects(SerialTransport.choose(), /port busy/);
    assert.deepEqual(filters, [{ usbVendorId: 0x1965, usbProductId: 0x001a }]);
    assert.equal(port.closeCount, 0);
    port.getInfo = () => ({ usbVendorId: 0x1234, usbProductId: 0x5678 });
    await assert.rejects(SerialTransport.choose(), /Select BCD325P2/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});
