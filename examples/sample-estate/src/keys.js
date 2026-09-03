// Fixture. Key establishment and signing as most services actually do it today.
import crypto from 'node:crypto';

export function newSigningKey() {
  return crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
}

export function newLegacyKey() {
  return crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
}

export function agree(privateKey, peerPublicKey) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateKey);
  return ecdh.computeSecret(peerPublicKey);
}

export function attest(payload, key) {
  return crypto.createSign('SHA256').update(payload).sign({ key, padding: crypto.constants.RSA_PKCS1_PADDING });
}

export function edSign(payload, key) {
  return crypto.sign(null, payload, key); // ed25519
}
