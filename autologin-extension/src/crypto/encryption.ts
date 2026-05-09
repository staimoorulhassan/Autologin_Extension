/**
 * Encryption Module
 * Handles AES-256-GCM encryption/decryption for sensitive data
 * Uses TweetNaCl.js for cryptographic operations
 */

import nacl from 'tweetnacl';

const NONCE_LENGTH = 24; // 192 bits for XSalsa20 (XSalsa20-Poly1305)
const KEY_LENGTH = 32; // 256 bits

/**
 * Generate a random encryption key (256-bit)
 */
export function generateKey(): Uint8Array {
  return nacl.randomBytes(KEY_LENGTH);
}

/**
 * Derive encryption key from password using PBKDF2-like approach
 * Note: For production, consider using a proper KDF library
 */
export function deriveKeyFromPassword(password: string): Uint8Array {
  // For now, use a simple approach (not cryptographically ideal)
  // TODO: Implement proper PBKDF2 or Argon2 in production
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  // Create a key by repeatedly hashing
  let hash = new Uint8Array(KEY_LENGTH);
  for (let i = 0; i < 1000; i++) {
    const combined = new Uint8Array(hash.length + data.length);
    combined.set(hash);
    combined.set(data, hash.length);
    hash = new Uint8Array(nacl.hash(combined).slice(0, KEY_LENGTH));
  }

  return hash;
}

/**
 * Encrypt plaintext with AES-256-GCM
 * Returns: nonce (24 bytes) + ciphertext + tag (concatenated)
 */
export function encryptData(plaintext: string, key: Uint8Array): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH}, got ${key.length}`);
  }

  // Generate random nonce
  const nonce = nacl.randomBytes(NONCE_LENGTH);

  // Encrypt using secretbox (NaCl's authenticated encryption)
  const encodedPlaintext = new TextEncoder().encode(plaintext);
  const ciphertext = nacl.secretbox(encodedPlaintext, nonce, key);

  // Combine nonce + ciphertext and return as hex string
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);

  return bytesToHex(combined);
}

/**
 * Decrypt ciphertext with AES-256-GCM
 * Expects: hex string of (nonce + ciphertext + tag)
 */
export function decryptData(encryptedHex: string, key: Uint8Array): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH}, got ${key.length}`);
  }

  try {
    // Convert hex back to bytes
    const combined = hexToBytes(encryptedHex);

    // Split nonce and ciphertext
    const nonce = combined.slice(0, NONCE_LENGTH);
    const ciphertext = combined.slice(NONCE_LENGTH);

    // Decrypt
    const plaintext = nacl.secretbox.open(ciphertext, nonce, key);

    if (!plaintext) {
      throw new Error('Decryption failed: authentication tag mismatch');
    }

    // Convert bytes to string
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    throw new Error(`Decryption error: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Create a hash of data (for integrity checking)
 */
export function hashData(data: string): string {
  const encoded = new TextEncoder().encode(data);
  const hash = nacl.hash(encoded);
  return bytesToHex(hash);
}

/**
 * Verify data integrity using hash
 */
export function verifyHash(data: string, expectedHash: string): boolean {
  const computedHash = hashData(data);
  return computedHash === expectedHash;
}

/**
 * Encrypt an object to JSON
 */
export function encryptObject<T>(obj: T, key: Uint8Array): string {
  const json = JSON.stringify(obj);
  return encryptData(json, key);
}

/**
 * Decrypt JSON to object
 */
export function decryptObject<T>(encryptedHex: string, key: Uint8Array): T {
  const json = decryptData(encryptedHex, key);
  return JSON.parse(json) as T;
}

export const CryptoManager = {
  generateKey,
  deriveKeyFromPassword,
  encryptData,
  decryptData,
  hashData,
  verifyHash,
  encryptObject,
  decryptObject
};
