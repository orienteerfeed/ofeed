import { createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { loadYaroc, type NativeClient } from '../yaroc.native.js';

// Uses the installed public main package, not a directly loaded platform binary.
// Opt in only on a supported host with permission to bind a localhost test socket.
describe.skipIf(process.env.YAROC_NATIVE_TEST !== '1')('published YAROC native MQTT', () => {
  const clients: NativeClient[] = [];
  const sockets: Socket[] = [];
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(async () => {
    for (const client of clients.splice(0)) client.stop();
    for (const socket of sockets.splice(0)) socket.destroy();
    for (const server of servers.splice(0))
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.each([
    { offset: '+02:00', minutes: 120 },
    { offset: '-05:00', minutes: -300 },
  ])(
    'decodes a reference punch with $offset independently of process TZ',
    async ({ offset, minutes }) => {
      const { MqttClient } = await loadYaroc();
      const topic = 'yar/deadbeef1234/p';
      // The sender always sends these exact bytes; it never calculates/converts time.
      // Reference record from YAROC common/src/punch.rs: Thursday, 10:00:03.792968750.
      const raw = Buffer.from('ff02d30d002f001a2b3c088ca3cb02000150e303', 'hex');
      const payload = Buffer.concat([Buffer.from([0x0a, raw.length]), raw]);
      const packet = (header: number, body: Buffer) => {
        if (body.length >= 128) throw new Error('Test packet too large');
        return Buffer.concat([Buffer.from([header, body.length]), body]);
      };
      const server = createServer((socket) => {
        sockets.push(socket);
        socket.on('error', () => {});
        let pending = Buffer.alloc(0);
        socket.on('data', (bytes) => {
          pending = Buffer.concat([pending, bytes]);
          while (pending.length >= 2) {
            let length = 0,
              multiplier = 1,
              cursor = 1,
              digit: number;
            do {
              if (cursor >= pending.length) return;
              digit = pending[cursor++];
              length += (digit & 127) * multiplier;
              multiplier *= 128;
            } while (digit & 128);
            if (pending.length < cursor + length) return;
            const type = pending[0] >> 4;
            const body = pending.subarray(cursor, cursor + length);
            pending = pending.subarray(cursor + length);
            if (type === 1) socket.write(Buffer.from([0x20, 2, 0, 0]));
            if (type === 8) {
              const size = body.readUInt16BE(2);
              const subscription = body.subarray(4, 4 + size).toString();
              socket.write(packet(0x90, Buffer.from([body[0], body[1], 0])));
              if (subscription === topic) {
                const topicBytes = Buffer.from(topic);
                const topicSize = Buffer.alloc(2);
                topicSize.writeUInt16BE(topicBytes.length);
                socket.write(packet(0x30, Buffer.concat([topicSize, topicBytes, payload])));
              }
            }
            if (type === 12) socket.write(Buffer.from([0xd0, 0]));
          }
        });
      });
      servers.push(server);
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test server address');
      const client = new MqttClient(
        [{ name: 'reference', macAddress: 'deadbeef1234' }],
        [{ url: '127.0.0.1', port: address.port, keepAliveSecs: 15 }],
        offset,
      );
      clients.push(client);
      const referenceNow = new Date(Date.now() + minutes * 60_000);
      const expectedDay = referenceNow.getUTCDate() - ((referenceNow.getUTCDay() + 7 - 4) % 7);
      const expectedTime =
        Date.UTC(
          referenceNow.getUTCFullYear(),
          referenceNow.getUTCMonth(),
          expectedDay,
          10,
          0,
          3,
          792,
        ) -
        minutes * 60_000;
      const received = await new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('No native MQTT punch within 5 seconds')),
          5000,
        );
        client.start((error, event) => {
          if (error) {
            clearTimeout(timeout);
            reject(error);
            return;
          }
          if (event && typeof event === 'object' && 'type' in event && event.type === 'SiPunches') {
            clearTimeout(timeout);
            resolve(event);
          }
        });
      });
      const { z } = await import('zod');
      const punchEvent = z
        .object({
          payload: z.array(
            z.object({
              hostInfo: z.object({ macAddress: z.string() }),
              punch: z.object({ card: z.number(), code: z.number(), time: z.string() }),
            }),
          ),
        })
        .parse(received);
      expect(punchEvent.payload).toHaveLength(1);
      const log = punchEvent.payload[0];
      expect(log.hostInfo.macAddress).toBe('deadbeef1234');
      expect(log.punch.card).toBe(1715004);
      expect(log.punch.code).toBe(47);
      expect(Date.parse(log.punch.time)).toBe(expectedTime);
    },
    10_000,
  );

  it('reports that IANA timezone names are not supported by 0.1.4', async () => {
    const { MqttClient } = await loadYaroc();
    const client = new MqttClient([], [], 'Europe/Prague');
    clients.push(client);
    const error = await new Promise<Error>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Missing invalid-timezone callback')),
        5000,
      );
      client.start((failure) => {
        clearTimeout(timeout);
        if (failure) resolve(failure);
        else reject(new Error('Unexpected acceptance of an IANA timezone'));
      });
    });
    expect(error.message).toContain('Invalid timezone offset');
  });
});
