import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Pool } from 'pg';

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

export async function runMigrations(params: {
  pool: Pool;
  migrationsDirectory: string;
}): Promise<MigrationResult> {
  const { pool, migrationsDirectory } = params;

  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const existing = await pool.query<{ filename: string }>(
      'select filename from schema_migrations where filename = $1',
      [file],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      skipped.push(file);
      continue;
    }

    const sql = await readFile(path.join(migrationsDirectory, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
      applied.push(file);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    applied,
    skipped,
  };
}
