const crypto = require('crypto');
const bcrypt = require('bcrypt');

const ENCRYPTION_PREFIX = 'enc:v1';
const MIN_SECRET_LENGTH = 32;

const getEncryptionSecret = (overrideSecret) => overrideSecret || process.env.FIELD_ENCRYPTION_KEY || process.env.APP_ENCRYPTION_KEY || '';

const getCipherKey = (overrideSecret) =>
  crypto.createHash('sha256').update(getEncryptionSecret(overrideSecret)).digest();

const assertEncryptionConfigured = (overrideSecret) => {
  const secret = getEncryptionSecret(overrideSecret);

  if (!secret) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY (or APP_ENCRYPTION_KEY fallback) is required. Generate one with: openssl rand -base64 32'
    );
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must be at least ${MIN_SECRET_LENGTH} characters long. Generate one with: openssl rand -base64 32`
    );
  }

  return secret;
};

const isEncrypted = (value) => String(value || '').startsWith(`${ENCRYPTION_PREFIX}:`);

const encryptText = (value, overrideSecret) => {
  if (value === null || value === undefined || value === '') {
    return value ?? null;
  }

  if (isEncrypted(value)) {
    return value;
  }

  assertEncryptionConfigured(overrideSecret);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getCipherKey(overrideSecret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
};

const decryptText = (value, overrideSecret) => {
  if (value === null || value === undefined || value === '') {
    return value ?? null;
  }

  if (!isEncrypted(value)) {
    return value;
  }

  assertEncryptionConfigured(overrideSecret);

  const [, , ivBase64, tagBase64, encryptedBase64] = String(value).split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getCipherKey(overrideSecret),
    Buffer.from(ivBase64, 'base64')
  );

  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

const hashOtp = async (otp) => bcrypt.hash(String(otp), 10);

const hashLookupValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
};

const verifyStoredOtp = async (storedValue, otp) => {
  if (!storedValue) return false;

  if (String(storedValue).startsWith('$2')) {
    return bcrypt.compare(String(otp), storedValue);
  }

  return String(storedValue) === String(otp);
};

module.exports = {
  assertEncryptionConfigured,
  decryptText,
  encryptText,
  hashOtp,
  hashLookupValue,
  isEncrypted,
  verifyStoredOtp,
};
