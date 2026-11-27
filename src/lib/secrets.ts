import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption for third-party credentials held in the database.
 *
 * Customer WMS credentials are not ours to lose. Stored in plain text, a
 * database backup or a leaked connection string would hand over every
 * customer's WMS access at once, so secrets are sealed with AES-256-GCM and the
 * key lives only in the environment — never in the database beside the data it
 * protects.
 *
 * Format: base64( iv[12] | authTag[16] | ciphertext )
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export class SecretsKeyMissing extends Error {
  constructor() {
    super(
      'CREDENTIALS_KEY is not set. Generate one with: openssl rand -base64 32',
    );
    this.name = 'SecretsKeyMissing';
  }
}

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) throw new SecretsKeyMissing();
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('CREDENTIALS_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)');
  }
  return key;
}

/** True when a key is configured and usable — lets the UI warn before saving. */
export function secretsKeyAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(sealed: string): string {
  const key = getKey();
  const buf = Buffer.from(sealed, 'base64');
  if (buf.length <= IV_LEN + TAG_LEN) throw new Error('Stored secret is malformed');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  // GCM verifies the tag on final(); a wrong key or tampered value throws here
  // rather than returning garbage.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
