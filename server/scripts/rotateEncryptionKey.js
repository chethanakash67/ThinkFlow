require('dotenv').config();

const { query, init, close } = require('../src/config/db');
const { decryptText, encryptText } = require('../src/utils/secureData');

const OLD_KEY = process.env.OLD_FIELD_ENCRYPTION_KEY;
const NEW_KEY = process.env.NEW_FIELD_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY;

const reencrypt = (value) => {
  if (!value) return null;
  return encryptText(decryptText(value, OLD_KEY), NEW_KEY);
};

async function rotateTable({
  table,
  idColumn,
  columns,
}) {
  const selectSql = `SELECT ${idColumn}, ${columns.join(', ')} FROM ${table}`;
  const result = await query(selectSql);

  for (const row of result.rows) {
    const nextValues = columns.map((column) => reencrypt(row[column]));
    const assignments = columns.map((column, index) => `${column} = $${index + 1}`).join(', ');
    await query(
      `UPDATE ${table} SET ${assignments} WHERE ${idColumn} = $${columns.length + 1}`,
      [...nextValues, row[idColumn]]
    );
  }
}

async function main() {
  if (!OLD_KEY) {
    throw new Error('OLD_FIELD_ENCRYPTION_KEY is required');
  }

  if (!NEW_KEY) {
    throw new Error('NEW_FIELD_ENCRYPTION_KEY or FIELD_ENCRYPTION_KEY is required');
  }

  await init();

  await rotateTable({
    table: 'users',
    idColumn: 'id',
    columns: ['email_encrypted', 'bio_encrypted', 'country_encrypted', 'github_url_encrypted'],
  });

  await rotateTable({
    table: 'competition_requests',
    idColumn: 'id',
    columns: ['creator_email_encrypted', 'creator_phone_encrypted', 'organization_name_encrypted'],
  });

  await rotateTable({
    table: 'users_pii_backup',
    idColumn: 'user_id',
    columns: ['email_backup_encrypted', 'bio_backup_encrypted', 'country_backup_encrypted', 'github_url_backup_encrypted'],
  });

  await rotateTable({
    table: 'competition_request_pii_backup',
    idColumn: 'request_id',
    columns: ['creator_email_backup_encrypted', 'creator_phone_backup_encrypted', 'organization_name_backup_encrypted'],
  });

  await close();
  console.log('✅ Encryption key rotation complete');
}

main().catch(async (error) => {
  console.error('❌ Encryption key rotation failed:', error.message);
  await close().catch(() => {});
  process.exit(1);
});
