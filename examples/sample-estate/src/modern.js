// Fixture. The parts of the estate that are already in good shape.
import crypto from 'node:crypto';

export const KEX_GROUPS = ['X25519MLKEM768', 'x25519'];
export const SIGNATURE_SUITE = 'ML-DSA-65';

export function seal(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  return { iv, body: Buffer.concat([cipher.update(plaintext), cipher.final()]), tag: cipher.getAuthTag() };
}

export function derive(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

export function stretch(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha256');
}
