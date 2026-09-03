// SSH prober.
// Speaks just enough of the transport layer to read the server identification
// string and the KEXINIT packet, which is where the offered key exchange, host
// key, cipher and MAC algorithms live.

import net from 'node:net';
import { parseEndpoint } from './tls.js';
import { CLASSICAL, QUANTUM } from './catalog.js';

const SSH_MSG_KEXINIT = 20;
const CLIENT_ID = 'SSH-2.0-Miftah_0.1.0';

const WEAK_KEX = [
  'diffie-hellman-group1-sha1',
  'diffie-hellman-group14-sha1',
  'diffie-hellman-group-exchange-sha1',
  'rsa1024-sha1',
  'gss-group1-sha1-'
];

const PQ_KEX = [
  'sntrup761x25519-sha512',
  'sntrup761x25519-sha512@openssh.com',
  'mlkem768x25519-sha256',
  'mlkem768nistp256-sha256',
  'ecdh-nistp384-kyber-768r3-sha384-d00@amazon.com'
];

const WEAK_HOST_KEY = ['ssh-rsa', 'ssh-dss', 'ssh-rsa-cert-v01@openssh.com'];
const WEAK_MAC = ['hmac-md5', 'hmac-sha1', 'hmac-md5-96', 'hmac-sha1-96', 'umac-64@openssh.com', 'umac-64-etm@openssh.com'];
const WEAK_CIPHER = ['3des-cbc', 'aes128-cbc', 'aes192-cbc', 'aes256-cbc', 'arcfour', 'arcfour128', 'arcfour256', 'blowfish-cbc', 'cast128-cbc', 'rijndael-cbc@lysator.liu.se'];

function readNameList(buffer, offset) {
  if (offset + 4 > buffer.length) return null;
  const length = buffer.readUInt32BE(offset);
  const start = offset + 4;
  const end = start + length;
  if (end > buffer.length) return null;
  const text = buffer.subarray(start, end).toString('utf8');
  return { value: text ? text.split(',') : [], next: end };
}

export function parseKexInit(payload) {
  if (!payload || payload.length < 17 || payload[0] !== SSH_MSG_KEXINIT) return null;
  let offset = 17; // message code plus the 16 byte cookie
  const names = [
    'kex', 'hostKey', 'cipherClientToServer', 'cipherServerToClient',
    'macClientToServer', 'macServerToClient', 'compressionClientToServer',
    'compressionServerToClient', 'languagesClientToServer', 'languagesServerToClient'
  ];
  const out = {};
  for (const name of names) {
    const list = readNameList(payload, offset);
    if (!list) return null;
    out[name] = list.value;
    offset = list.next;
  }
  return out;
}

function buildKexInit() {
  const cookie = Buffer.alloc(16);
  for (let i = 0; i < 16; i += 1) cookie[i] = Math.floor(Math.random() * 256);

  const lists = [
    'curve25519-sha256,diffie-hellman-group14-sha256',
    'ssh-ed25519,rsa-sha2-512',
    'aes256-gcm@openssh.com', 'aes256-gcm@openssh.com',
    'hmac-sha2-256', 'hmac-sha2-256',
    'none', 'none',
    '', ''
  ];

  const parts = [Buffer.from([SSH_MSG_KEXINIT]), cookie];
  for (const list of lists) {
    const body = Buffer.from(list, 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length, 0);
    parts.push(header, body);
  }
  parts.push(Buffer.from([0]));           // first_kex_packet_follows
  parts.push(Buffer.alloc(4));            // reserved

  const payload = Buffer.concat(parts);
  const blockSize = 8;
  let paddingLength = blockSize - ((payload.length + 5) % blockSize);
  if (paddingLength < 4) paddingLength += blockSize;

  const packet = Buffer.alloc(4 + 1 + payload.length + paddingLength);
  packet.writeUInt32BE(payload.length + paddingLength + 1, 0);
  packet.writeUInt8(paddingLength, 4);
  payload.copy(packet, 5);
  return packet;
}

export function probeSsh(endpoint, options = {}) {
  const { host, port } = parseEndpoint(endpoint, options.defaultPort || 22);
  const timeout = options.timeout || 7000;
  const started = Date.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let banner = null;
    let sentId = false;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(Object.assign({
        endpoint: `${host}:${port}`,
        host,
        port,
        startedAt: new Date(started).toISOString(),
        durationMs: Date.now() - started
      }, value));
    };

    socket.setTimeout(timeout, () => finish({ reachable: Boolean(banner), banner, error: 'timeout', findings: [] }));
    socket.on('error', (error) => finish({ reachable: false, error: error.code || error.message, findings: [] }));

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (!banner) {
        const text = buffer.toString('latin1');
        const end = text.indexOf('\r\n');
        if (end === -1) return;
        banner = text.slice(0, end);
        buffer = buffer.subarray(end + 2);
        if (!sentId) {
          sentId = true;
          socket.write(`${CLIENT_ID}\r\n`);
          socket.write(buildKexInit());
        }
      }

      if (buffer.length < 4) return;
      const packetLength = buffer.readUInt32BE(0);
      if (packetLength > 262144) return finish({ reachable: true, banner, error: 'oversized packet', findings: [] });
      if (buffer.length < 4 + packetLength) return;

      const paddingLength = buffer.readUInt8(4);
      const payload = buffer.subarray(5, 4 + packetLength - paddingLength);
      const algorithms = parseKexInit(payload);
      if (!algorithms) return finish({ reachable: true, banner, error: 'unexpected packet', findings: [] });

      finish(Object.assign({ reachable: true, banner, algorithms }, evaluate(algorithms, `${host}:${port}`, banner)));
    });
  });
}

export function evaluate(algorithms, where, banner) {
  const findings = [];
  const hit = (list, bad) => (list || []).filter((item) => bad.includes(item));

  const weakKex = hit(algorithms.kex, WEAK_KEX);
  const pqKex = (algorithms.kex || []).filter((item) => PQ_KEX.includes(item) || /mlkem|kyber|sntrup/i.test(item));
  const weakHostKey = hit(algorithms.hostKey, WEAK_HOST_KEY);
  const weakMac = hit([...(algorithms.macServerToClient || []), ...(algorithms.macClientToServer || [])], WEAK_MAC);
  const weakCipher = hit([...(algorithms.cipherServerToClient || []), ...(algorithms.cipherClientToServer || [])], WEAK_CIPHER);

  if (weakKex.length) {
    findings.push({
      rule: 'MFT-S010',
      title: 'SSH offers a SHA-1 key exchange',
      severity: 'high',
      classical: CLASSICAL.WEAK,
      quantum: QUANTUM.BROKEN,
      protocol: 'ssh',
      advice: `Remove ${weakKex.join(', ')} from KexAlgorithms.`,
      file: where,
      line: 0,
      detail: weakKex.join(', ')
    });
  }

  if (weakHostKey.length) {
    findings.push({
      rule: 'MFT-S011',
      title: 'SSH offers a SHA-1 host key algorithm',
      severity: 'high',
      classical: CLASSICAL.WEAK,
      quantum: QUANTUM.BROKEN,
      protocol: 'ssh',
      advice: `Remove ${weakHostKey.join(', ')} and keep rsa-sha2-512 and ssh-ed25519.`,
      file: where,
      line: 0,
      detail: weakHostKey.join(', ')
    });
  }

  if (weakCipher.length) {
    findings.push({
      rule: 'MFT-S012',
      title: 'SSH offers a CBC or legacy cipher',
      severity: weakCipher.some((c) => /3des|arcfour|blowfish/.test(c)) ? 'high' : 'medium',
      classical: CLASSICAL.WEAK,
      quantum: QUANTUM.WEAKENED,
      protocol: 'ssh',
      advice: 'Restrict Ciphers to aes256-gcm@openssh.com and chacha20-poly1305@openssh.com.',
      file: where,
      line: 0,
      detail: weakCipher.join(', ')
    });
  }

  if (weakMac.length) {
    findings.push({
      rule: 'MFT-S013',
      title: 'SSH offers a weak MAC',
      severity: 'medium',
      classical: CLASSICAL.WEAK,
      quantum: QUANTUM.WEAKENED,
      protocol: 'ssh',
      advice: 'Restrict MACs to hmac-sha2-512-etm@openssh.com and hmac-sha2-256-etm@openssh.com.',
      file: where,
      line: 0,
      detail: weakMac.join(', ')
    });
  }

  if (pqKex.length === 0) {
    findings.push({
      rule: 'MFT-S014',
      title: 'SSH has no post quantum key exchange',
      severity: 'high',
      classical: CLASSICAL.STRONG,
      quantum: QUANTUM.BROKEN,
      protocol: 'ssh',
      advice: 'Add sntrup761x25519-sha512@openssh.com or mlkem768x25519-sha256 to KexAlgorithms. Recorded sessions are readable later without it.',
      file: where,
      line: 0,
      detail: banner || ''
    });
  } else {
    findings.push({
      rule: 'MFT-S015',
      title: 'SSH offers post quantum key exchange',
      severity: 'info',
      classical: CLASSICAL.STRONG,
      quantum: QUANTUM.RESISTANT,
      protocol: 'ssh',
      advice: 'Confirm it is first in the client preference order.',
      file: where,
      line: 0,
      detail: pqKex.join(', ')
    });
  }

  return { findings, postQuantumKex: pqKex, weakKex, weakHostKey, weakCipher, weakMac };
}

export default probeSsh;
