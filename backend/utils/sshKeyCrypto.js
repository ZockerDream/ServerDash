// AES-256-GCM encryption helpers for SSH private keys stored in the DB.
// The encryption key is derived from JWT_SECRET via SHA-256 so it is always 32 bytes.
//
// Stored format:  <iv_hex>:<authTag_hex>:<ciphertext_hex>  (all hex-encoded)

const crypto = require('crypto');

function derivedKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return crypto.createHash('sha256').update(secret).digest(); // 32-byte Buffer
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string}  "<iv>:<authTag>:<ciphertext>" in hex
 */
function encrypt(plaintext) {
  const key = derivedKey();
  const iv  = crypto.randomBytes(12); // 96-bit IV is standard for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a value produced by encrypt().
 * @param {string} stored
 * @returns {string} original plaintext
 */
function decrypt(stored) {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error('Invalid encrypted format');
  const key        = derivedKey();
  const iv         = Buffer.from(ivHex, 'hex');
  const authTag    = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher   = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
