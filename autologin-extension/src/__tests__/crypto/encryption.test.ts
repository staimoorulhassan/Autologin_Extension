/**
 * Encryption Module Tests
 * Verifies AES-256-GCM encryption/decryption with TweetNaCl.js
 * Addresses: REQ-1.3 (encrypted storage), REQ-1.3.1-4, REQ-1.9 (backup export)
 */

import {
  generateKey,
  deriveKeyFromPassword,
  encryptData,
  decryptData,
  hashData,
  verifyHash,
  encryptObject,
  decryptObject,
  CryptoManager
} from '../../crypto/encryption';

describe('Encryption Module', () => {
  describe('generateKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should generate unique keys each time', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1).not.toEqual(key2);
    });

    it('should generate random bytes (not zeros)', () => {
      const key = generateKey();
      const nonZeroBytes = Array.from(key).filter(b => b !== 0).length;
      expect(nonZeroBytes).toBeGreaterThan(20); // Very high probability
    });
  });

  describe('deriveKeyFromPassword', () => {
    it('should derive a 32-byte key from password', () => {
      const password = 'mySecurePassword123';
      const key = deriveKeyFromPassword(password);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should derive the same key from the same password', () => {
      const password = 'testPassword';
      const key1 = deriveKeyFromPassword(password);
      const key2 = deriveKeyFromPassword(password);
      expect(key1).toEqual(key2);
    });

    it('should derive different keys from different passwords', () => {
      const key1 = deriveKeyFromPassword('password1');
      const key2 = deriveKeyFromPassword('password2');
      expect(key1).not.toEqual(key2);
    });

    it('should handle unicode and special characters', () => {
      const passwords = [
        'pässwörd',
        '密码',
        'مرحبا',
        'pass@word#123!',
        'very long password with spaces and special chars !@#$%^&*()'
      ];

      passwords.forEach(pwd => {
        expect(() => deriveKeyFromPassword(pwd)).not.toThrow();
        const key = deriveKeyFromPassword(pwd);
        expect(key.length).toBe(32);
      });
    });

    it('should handle empty password', () => {
      const key = deriveKeyFromPassword('');
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });
  });

  describe('encryptData', () => {
    let key: Uint8Array;

    beforeEach(() => {
      key = generateKey();
    });

    it('should encrypt plaintext to hex string', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encryptData(plaintext, key);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.match(/^[0-9a-f]+$/)).toBeTruthy();
    });

    it('should produce different ciphertexts for same plaintext (random nonce)', () => {
      const plaintext = 'Secret message';
      const encrypted1 = encryptData(plaintext, key);
      const encrypted2 = encryptData(plaintext, key);
      expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should produce hex string with correct length', () => {
      // nonce (24 bytes) + ciphertext (plaintext + 16-byte auth tag)
      const plaintext = 'Test';
      const encrypted = encryptData(plaintext, key);
      const expectedBytes = 24 + plaintext.length + 16;
      const expectedHexLength = expectedBytes * 2;
      expect(encrypted.length).toBe(expectedHexLength);
    });

    it('should throw on invalid key length', () => {
      const shortKey = new Uint8Array(16);
      const plaintext = 'Test';
      expect(() => encryptData(plaintext, shortKey)).toThrow();
    });

    it('should handle empty plaintext', () => {
      const encrypted = encryptData('', key);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should handle long plaintext', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encryptData(plaintext, key);
      expect(typeof encrypted).toBe('string');
    });

    it('should handle special characters in plaintext', () => {
      const plaintexts = [
        'Special: !@#$%^&*()',
        'Unicode: 你好世界',
        'Emoji: 😀🔐🎉',
        'Newlines:\nand\ttabs'
      ];

      plaintexts.forEach(plaintext => {
        expect(() => encryptData(plaintext, key)).not.toThrow();
      });
    });
  });

  describe('decryptData', () => {
    let key: Uint8Array;
    let plaintext: string;
    let encrypted: string;

    beforeEach(() => {
      key = generateKey();
      plaintext = 'Secret credentials: user@example.com:password123';
      encrypted = encryptData(plaintext, key);
    });

    it('should decrypt encrypted data back to plaintext', () => {
      const decrypted = decryptData(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw on invalid key', () => {
      const wrongKey = generateKey();
      expect(() => decryptData(encrypted, wrongKey)).toThrow();
    });

    it('should throw on corrupted ciphertext', () => {
      // Flip a bit in the middle
      const corruptedHex = encrypted.substring(0, 100) +
        (parseInt(encrypted[100], 16) ^ 1).toString(16) +
        encrypted.substring(101);
      expect(() => decryptData(corruptedHex, key)).toThrow();
    });

    it('should throw on invalid key length', () => {
      const shortKey = new Uint8Array(16);
      expect(() => decryptData(encrypted, shortKey)).toThrow();
    });

    it('should throw on invalid hex format', () => {
      expect(() => decryptData('not-valid-hex-xyz', key)).toThrow();
    });

    it('should throw on truncated ciphertext', () => {
      // Remove last byte
      const truncated = encrypted.substring(0, encrypted.length - 2);
      expect(() => decryptData(truncated, key)).toThrow();
    });

    it('should handle empty plaintext roundtrip', () => {
      const emptyEncrypted = encryptData('', key);
      const decrypted = decryptData(emptyEncrypted, key);
      expect(decrypted).toBe('');
    });

    it('should preserve special characters in roundtrip', () => {
      const testPlaintext = 'Test: 你好\n\t!@#$%';
      const enc = encryptData(testPlaintext, key);
      const dec = decryptData(enc, key);
      expect(dec).toBe(testPlaintext);
    });
  });

  describe('hashData', () => {
    it('should create a hash string', () => {
      const data = 'Hello, World!';
      const hash = hashData(data);
      expect(typeof hash).toBe('string');
      expect(hash.match(/^[0-9a-f]+$/)).toBeTruthy();
    });

    it('should produce consistent hashes', () => {
      const data = 'test data';
      const hash1 = hashData(data);
      const hash2 = hashData(data);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = hashData('data1');
      const hash2 = hashData('data2');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce consistent hash length', () => {
      // NaCl hash produces 64 bytes
      const hash = hashData('test');
      expect(hash.length).toBe(128); // 64 bytes = 128 hex chars
    });

    it('should handle empty string', () => {
      const hash = hashData('');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(128);
    });

    it('should handle long data', () => {
      const data = 'x'.repeat(10000);
      const hash = hashData(data);
      expect(hash.length).toBe(128);
    });
  });

  describe('verifyHash', () => {
    it('should verify correct hash', () => {
      const data = 'Important data';
      const hash = hashData(data);
      expect(verifyHash(data, hash)).toBe(true);
    });

    it('should reject incorrect hash', () => {
      const data = 'Important data';
      const wrongHash = hashData('different data');
      expect(verifyHash(data, wrongHash)).toBe(false);
    });

    it('should reject tampered data', () => {
      const originalData = 'credentials: admin:password123';
      const hash = hashData(originalData);
      const tamperedData = 'credentials: hacker:hacker123';
      expect(verifyHash(tamperedData, hash)).toBe(false);
    });

    it('should be case-sensitive', () => {
      const data = 'TestData';
      const hash = hashData(data);
      expect(verifyHash('testdata', hash)).toBe(false);
      expect(verifyHash('TestData', hash)).toBe(true);
    });
  });

  describe('encryptObject', () => {
    let key: Uint8Array;

    beforeEach(() => {
      key = generateKey();
    });

    it('should encrypt object to hex string', () => {
      const obj = { username: 'user@example.com', password: 'secret123' };
      const encrypted = encryptObject(obj, key);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.match(/^[0-9a-f]+$/)).toBeTruthy();
    });

    it('should handle nested objects', () => {
      const obj = {
        user: { name: 'John', email: 'john@example.com' },
        credentials: { username: 'john_user', password: 'pass123' }
      };
      const encrypted = encryptObject(obj, key);
      expect(typeof encrypted).toBe('string');
    });

    it('should handle arrays', () => {
      const obj = {
        accounts: [
          { url: 'example.com', username: 'user1' },
          { url: 'test.com', username: 'user2' }
        ]
      };
      const encrypted = encryptObject(obj, key);
      expect(typeof encrypted).toBe('string');
    });

    it('should handle null and undefined', () => {
      const obj = {
        name: 'test',
        value: null,
        optional: undefined
      };
      const encrypted = encryptObject(obj, key);
      expect(typeof encrypted).toBe('string');
    });

    it('should handle empty object', () => {
      const encrypted = encryptObject({}, key);
      expect(typeof encrypted).toBe('string');
    });
  });

  describe('decryptObject', () => {
    let key: Uint8Array;

    beforeEach(() => {
      key = generateKey();
    });

    it('should decrypt object back to original', () => {
      const originalObj = {
        url: 'https://example.com',
        username: 'user@example.com',
        password: 'securePassword123'
      };
      const encrypted = encryptObject(originalObj, key);
      const decrypted = decryptObject<typeof originalObj>(encrypted, key);
      expect(decrypted).toEqual(originalObj);
    });

    it('should preserve object structure', () => {
      const originalObj = {
        name: 'Test Account',
        credentials: {
          username: 'testuser',
          password: 'testpass'
        },
        sites: ['site1.com', 'site2.com'],
        metadata: {
          created: 1234567890,
          updated: 1234567900
        }
      };
      const encrypted = encryptObject(originalObj, key);
      const decrypted = decryptObject<typeof originalObj>(encrypted, key);
      expect(decrypted).toEqual(originalObj);
    });

    it('should throw on wrong key', () => {
      const obj = { secret: 'data' };
      const encrypted = encryptObject(obj, key);
      const wrongKey = generateKey();
      expect(() => decryptObject(encrypted, wrongKey)).toThrow();
    });

    it('should throw on corrupted data', () => {
      const obj = { secret: 'data' };
      const encrypted = encryptObject(obj, key);
      const corrupted = encrypted.substring(0, encrypted.length - 2);
      expect(() => decryptObject(corrupted, key)).toThrow(); // Invalid due to corruption
    });
  });

  describe('CryptoManager export', () => {
    it('should export all crypto functions', () => {
      expect(CryptoManager.generateKey).toBeDefined();
      expect(CryptoManager.deriveKeyFromPassword).toBeDefined();
      expect(CryptoManager.encryptData).toBeDefined();
      expect(CryptoManager.decryptData).toBeDefined();
      expect(CryptoManager.hashData).toBeDefined();
      expect(CryptoManager.verifyHash).toBeDefined();
      expect(CryptoManager.encryptObject).toBeDefined();
      expect(CryptoManager.decryptObject).toBeDefined();
    });

    it('should provide functional interface', () => {
      const key = CryptoManager.generateKey();
      const encrypted = CryptoManager.encryptData('test', key);
      const decrypted = CryptoManager.decryptData(encrypted, key);
      expect(decrypted).toBe('test');
    });
  });

  describe('Credential Encryption Scenarios', () => {
    it('should safely encrypt credential object', () => {
      const key = generateKey();
      const credential = {
        id: '1',
        url: 'https://bank.example.com',
        username: 'john_doe',
        password: 'SuperSecret123!@#',
        created_at: Date.now(),
        notes: 'Main bank account'
      };

      const encrypted = encryptObject(credential, key);
      const decrypted = decryptObject<typeof credential>(encrypted, key);
      expect(decrypted).toEqual(credential);
      // Verify encrypted form is not readable
      expect(encrypted).not.toContain('john_doe');
      expect(encrypted).not.toContain('SuperSecret123');
    });

    it('should support password-based encryption', () => {
      const masterPassword = 'MyMasterPassword123';
      const key = deriveKeyFromPassword(masterPassword);

      const credential = {
        username: 'user@example.com',
        password: 'accountPassword'
      };

      const encrypted = encryptObject(credential, key);

      // Same password should decrypt
      const key2 = deriveKeyFromPassword(masterPassword);
      const decrypted = decryptObject<typeof credential>(encrypted, key2);
      expect(decrypted).toEqual(credential);

      // Wrong password should fail
      const wrongKey = deriveKeyFromPassword('WrongPassword');
      expect(() => decryptObject(encrypted, wrongKey)).toThrow();
    });

    it('should handle batch encryption of credentials', () => {
      const key = generateKey();
      const credentials = [
        { url: 'site1.com', username: 'user1', password: 'pass1' },
        { url: 'site2.com', username: 'user2', password: 'pass2' },
        { url: 'site3.com', username: 'user3', password: 'pass3' }
      ];

      const encrypted = credentials.map(cred => encryptObject(cred, key));
      const decrypted = encrypted.map(enc => decryptObject<typeof credentials[0]>(enc, key));

      expect(decrypted).toEqual(credentials);
    });
  });

  describe('Security Properties', () => {
    it('should use authenticated encryption (not just confidentiality)', () => {
      const key = generateKey();
      const plaintext = 'sensitive data';
      const encrypted = encryptData(plaintext, key);

      // Corrupting even one bit should cause decryption to fail
      const hexArray = Array.from(encrypted);
      hexArray[50] = (parseInt(hexArray[50], 16) ^ 1).toString(16);
      const corrupted = hexArray.join('');

      expect(() => decryptData(corrupted, key)).toThrow('authentication tag mismatch');
    });

    it('should not leak plaintext length beyond ciphertext length', () => {
      const key = generateKey();
      const encrypted1 = encryptData('a', key);
      const encrypted2 = encryptData('aaa', key);
      const encrypted3 = encryptData('aaaaaaa', key);

      // Due to nonce + auth tag, all should have different lengths
      expect(encrypted1.length).toBeLessThan(encrypted2.length);
      expect(encrypted2.length).toBeLessThan(encrypted3.length);
    });
  });
});
