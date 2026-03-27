const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.FIELD_ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.JWT_SECRET = 'jwt-test-secret';
process.env.SENDGRID_API_KEY = 'test-sendgrid-key';

const secureDataPath = path.resolve(__dirname, '../src/utils/secureData.js');
const authControllerPath = path.resolve(__dirname, '../src/controllers/auth.controller.js');
const dbPath = path.resolve(__dirname, '../src/config/db.js');
const authMiddlewarePath = path.resolve(__dirname, '../src/middlewares/auth.middleware.js');
const emailServicePath = path.resolve(__dirname, '../src/services/emailService.js');
const gamificationPath = path.resolve(__dirname, '../services/gamificationService.js');
const expressValidatorPath = require.resolve('express-validator');

const { decryptText, hashLookupValue, isEncrypted } = require(secureDataPath);

const createResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return response;
};

const createDbMock = (state) => async (sql, params = []) => {
  if (sql.includes('SELECT id, email_verified FROM users WHERE email_sha256 = $1')) {
    return {
      rows: state.users
        .filter((user) => user.email_sha256 === params[0])
        .map((user) => ({ id: user.id, email_verified: user.email_verified })),
    };
  }

  if (sql.includes('INSERT INTO users (name, email_encrypted, email_sha256, password_hash, otp_code, otp_expires, otp_type, email_verified)')) {
    const user = {
      id: state.nextUserId++,
      name: params[0],
      email: null,
      email_encrypted: params[1],
      email_sha256: params[2],
      password_hash: params[3],
      otp_code: params[4],
      otp_expires: params[5],
      otp_type: 'signup',
      email_verified: false,
      role: 'user',
      bio: null,
      bio_encrypted: null,
      country: null,
      country_encrypted: null,
      github_url: null,
      github_url_encrypted: null,
      preferred_language: null,
      created_at: new Date().toISOString(),
    };
    state.users.push(user);
    return { rows: [user], rowCount: 1 };
  }

  if (sql.includes('UPDATE users') && sql.includes('SET name = $1, email_encrypted = $2, email_sha256 = $3, password_hash = $4, otp_code = $5, otp_expires = $6, otp_type = \'signup\'')) {
    const user = state.users.find((entry) => entry.id === params[6]);
    Object.assign(user, {
      name: params[0],
      email_encrypted: params[1],
      email_sha256: params[2],
      password_hash: params[3],
      otp_code: params[4],
      otp_expires: params[5],
      otp_type: 'signup',
    });
    return { rows: [user], rowCount: 1 };
  }

  if (sql.includes('SELECT id FROM users WHERE email_sha256 = $1')) {
    return {
      rows: state.users
        .filter((user) => user.email_sha256 === params[0])
        .map((user) => ({ id: user.id })),
    };
  }

  if (sql.includes('UPDATE users SET otp_code = $1, otp_expires = $2, otp_type = $3 WHERE id = $4')) {
    const user = state.users.find((entry) => entry.id === params[3]);
    Object.assign(user, { otp_code: params[0], otp_expires: params[1], otp_type: params[2] });
    return { rows: [], rowCount: 1 };
  }

  if (sql.startsWith('SELECT ') && sql.includes('FROM users WHERE email_sha256 = $1')) {
    return { rows: state.users.filter((user) => user.email_sha256 === params[0]) };
  }

  if (sql.includes('UPDATE users') && sql.includes('bio_encrypted = $2')) {
    const user = state.users.find((entry) => entry.id === params[5]);
    Object.assign(user, {
      name: params[0],
      bio: null,
      bio_encrypted: params[1],
      country: null,
      country_encrypted: params[2],
      github_url: null,
      github_url_encrypted: params[3],
      preferred_language: params[4],
    });
    return { rows: [user], rowCount: 1 };
  }

  throw new Error(`Unhandled SQL in test mock: ${sql}`);
};

const loadAuthController = (state) => {
  delete require.cache[authControllerPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { query: createDbMock(state) },
  };
  require.cache[authMiddlewarePath] = {
    id: authMiddlewarePath,
    filename: authMiddlewarePath,
    loaded: true,
    exports: { generateToken: (userId) => `token-${userId}` },
  };
  require.cache[emailServicePath] = {
    id: emailServicePath,
    filename: emailServicePath,
    loaded: true,
    exports: {
      sendOTPEmail: async (email, otp, type) => {
        state.sentEmails.push({ email, otp, type });
      },
    },
  };
  require.cache[gamificationPath] = {
    id: gamificationPath,
    filename: gamificationPath,
    loaded: true,
    exports: {
      getUserPointsSummary: async () => ({ solvedCount: 0, totalPoints: 0, weeklyPoints: 0, badges: [] }),
      getUserRanks: async () => ({ global: null, weekly: null }),
    },
  };
  require.cache[expressValidatorPath] = {
    id: expressValidatorPath,
    filename: expressValidatorPath,
    loaded: true,
    exports: {
      validationResult: () => ({
        isEmpty: () => true,
        array: () => [],
      }),
    },
  };

  return require(authControllerPath);
};

test('signup, login, and profile update keep sensitive fields encrypted at rest', async () => {
  const state = { users: [], nextUserId: 1, sentEmails: [] };
  const authController = loadAuthController(state);

  const signupReq = {
    body: {
      name: 'Alice',
      email: 'alice@example.com',
      password: 'Password1',
    },
  };
  const signupRes = createResponse();

  await authController.signup(signupReq, signupRes);

  assert.equal(signupRes.statusCode, 200);
  assert.equal(state.users.length, 1);
  assert.equal(state.sentEmails.length, 1);

  const storedUser = state.users[0];
  assert.equal(storedUser.email, null);
  assert.equal(storedUser.email_sha256, hashLookupValue('alice@example.com'));
  assert.equal(isEncrypted(storedUser.email_encrypted), true);
  assert.equal(decryptText(storedUser.email_encrypted), 'alice@example.com');
  assert.notEqual(storedUser.otp_code, state.sentEmails[0].otp);

  storedUser.email_verified = true;

  const signinReq = {
    body: {
      email: 'alice@example.com',
      password: 'Password1',
    },
  };
  const signinRes = createResponse();

  await authController.signin(signinReq, signinRes);

  assert.equal(signinRes.statusCode, 200);
  assert.equal(signinRes.body.user.email, 'alice@example.com');
  assert.equal(signinRes.body.token, 'token-1');

  const profileReq = {
    user: { id: storedUser.id },
    body: {
      name: 'Alice Johnson',
      bio: 'Backend engineer',
      country: 'India',
      githubUrl: 'https://github.com/alice',
      preferredLanguage: 'javascript',
    },
  };
  const profileRes = createResponse();

  await authController.updateProfile(profileReq, profileRes);

  assert.equal(profileRes.statusCode, 200);
  assert.equal(profileRes.body.profile.bio, 'Backend engineer');
  assert.equal(profileRes.body.profile.country, 'India');
  assert.equal(profileRes.body.profile.githubUrl, 'https://github.com/alice');

  assert.equal(storedUser.bio, null);
  assert.equal(storedUser.country, null);
  assert.equal(storedUser.github_url, null);
  assert.equal(decryptText(storedUser.bio_encrypted), 'Backend engineer');
  assert.equal(decryptText(storedUser.country_encrypted), 'India');
  assert.equal(decryptText(storedUser.github_url_encrypted), 'https://github.com/alice');
});
