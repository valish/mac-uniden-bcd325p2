// Web Serial uses the macOS USB serial driver without claiming its interfaces.
export class SerialTransport {
  constructor(port, { timeout = 6000 } = {}) {
    this.port = port;
    this.timeout = timeout;
    this.buffer = '';
    this.pending = null;
    this.closed = true;
    this.decoder = new TextDecoder('ascii');
    this.opened = false;
  }
  static async choose() {
    if (!globalThis.navigator?.serial)
      throw Error(
        'Open this launcher in desktop Google Chrome or Microsoft Edge. Web Serial is unavailable in this browser.',
      );
    const port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x1965, usbProductId: 0x001a }],
    });
    const info = port.getInfo();
    if (info.usbVendorId !== 0x1965 || info.usbProductId !== 0x001a)
      throw Error('Select BCD325P2 Serial Port. No scanner commands were sent.');
    const transport = new SerialTransport(port);
    try {
      await transport.open();
      return transport;
    } catch (e) {
      await transport.close(e);
      throw Error(
        `Could not open the scanner serial port: ${e.message}. Close other scanner tabs/apps, reconnect its cable, then try Connect scanner again.`,
      );
    }
  }
  async open() {
    await this.port.open({
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
      bufferSize: 4096,
    });
    this.opened = true;
    await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
    if (!this.port.readable || !this.port.writable)
      throw Error('The scanner serial streams are unavailable');
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.closed = false;
    this.readTask = this.readLoop();
  }
  async readLoop() {
    try {
      while (!this.closed) {
        const { value, done } = await this.reader.read();
        if (this.closed) break;
        if (done) throw Error('The scanner serial port disconnected');
        if (!value) continue;
        this.buffer += this.decoder.decode(value, { stream: true });
        if (this.buffer.length > 65536)
          throw Error('Scanner response exceeded the expected length');
        let end;
        while ((end = this.buffer.indexOf('\r')) >= 0) {
          const line = this.buffer.slice(0, end).replace(/^\n/, '');
          this.buffer = this.buffer.slice(end + 1);
          if (!line) continue;
          if (!this.pending)
            throw Error(
              `Unexpected scanner traffic: ${line.slice(0, 100)}. Reconnect from Scan/Hold.`,
            );
          const pending = this.pending;
          this.pending = null;
          clearTimeout(pending.timer);
          pending.resolve(line);
        }
      }
    } catch (e) {
      if (!this.closed) {
        this.failure = e;
        void this.close(e);
      }
    } finally {
      this.reader?.releaseLock();
      this.reader = null;
    }
  }
  exchange(command) {
    if (this.closed) return Promise.reject(this.failure || Error('Scanner is disconnected'));
    if (this.pending) return Promise.reject(Error('Only one scanner command may be outstanding'));
    if (!/^[\x20-\x7e]+$/.test(command) || command.length > 4096)
      return Promise.reject(Error('Invalid command framing'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const verb = command.split(',')[0];
        const error = Error(
          ['MDL', 'VER'].includes(verb)
            ? `No response to ${verb}. Return the scanner to Scan/Hold, check its connection, and reconnect.`
            : `No response to ${verb}. Upload stopped; do not repeat a partial upload.`,
        );
        this.failure = error;
        void this.close(error);
      }, this.timeout);
      this.pending = { resolve, reject, timer };
      this.writeTask = this.writer.write(new TextEncoder().encode(command + '\r'));
      this.writeTask.catch((e) => {
        this.failure = e;
        void this.close(e);
      });
    });
  }
  close(error = Error('Scanner disconnected')) {
    if (this.closeTask) return this.closeTask;
    this.closed = true;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.closeTask = (async () => {
      try {
        await this.reader?.cancel();
      } catch {}
      await this.readTask;
      if (this.writer) {
        try {
          await this.writer.abort(error);
        } catch {}
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.opened) {
        try {
          await this.port.close();
        } catch (e) {
          this.failure ??= e;
        }
        this.opened = false;
      }
    })();
    return this.closeTask;
  }
}
