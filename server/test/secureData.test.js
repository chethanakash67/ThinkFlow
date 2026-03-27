const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const secureDataPath = path.resolve(__dirname, '../src/utils/secureData.js');

const loadSecureData = () => {
  delete require.cache[secureDataPath];
  return require(secureDataPath);
};

test('secureData encrypts and decrypts values round-trip', () => {
  process.env.FIELD_ENCRYPTION_KEY = '12345678901234567890123456789012';
  const { encryptText, decryptText, isEncrypted } = loadSecureData();

  const encrypted = encryptText('alice@example.com');

  assert.notEqual(encrypted, 'alice@example.com');
  assert.equal(isEncrypted(encrypted), true);
  assert.equal(decryptText(encrypted), 'alice@example.com');
});

test('secureData avoids double encryption', () => {
  process.env.FIELD_ENCRYPTION_KEY = '12345678901234567890123456789012';
  const { encryptText } = loadSecureData();

  const encrypted = encryptText('sensitive-value');

  assert.equal(encryptText(encrypted), encrypted);
});

test('secureData detects tampering', () => {
  process.env.FIELD_ENCRYPTION_KEY = '12345678901234567890123456789012';
  const { encryptText, decryptText } = loadSecureData();

  const encrypted = encryptText('tamper-check');
  const tampered = `${encrypted.slice(0, -1)}A`;

  assert.throws(() => decryptText(tampered));
});

test('secureData requires an encryption key', () => {
  delete process.env.FIELD_ENCRYPTION_KEY;
  delete process.env.APP_ENCRYPTION_KEY;
  const { assertEncryptionConfigured } = loadSecureData();

  assert.throws(() => assertEncryptionConfigured(), /FIELD_ENCRYPTION_KEY/);
});
