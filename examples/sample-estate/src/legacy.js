// Fixture. Every line here is something Miftah should complain about.
import crypto from 'node:crypto';

export function fingerprint(input) {
  return crypto.createHash('md5').update(input).digest('hex');
}

export function legacySign(input, key) {
  return crypto.createSign('sha1').update(input).sign(key);
}

export function wrap(plaintext, key) {
  const cipher = crypto.createCipheriv('des-ede3-cbc', key, Buffer.alloc(8));
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

export function seal(plaintext, key) {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

export function sessionToken() {
  return Math.random().toString(36).slice(2);
}
