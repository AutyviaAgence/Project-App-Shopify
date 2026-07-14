/**
 * Applique un fichier SQL via le tunnel SSH.
 *
 *   ssh -N -L 5435:<ip-conteneur-db>:5432 ubuntu@<vps>
 *   PGPASSWORD=… node scripts/apply-sql.mjs supabase/migrations/<fichier>.sql
 *
 * ⚠️ Viser l'IP du CONTENEUR `db` de Supabase, pas l'hôte : le Postgres de
 * l'hôte est un autre serveur, qui refuse ces identifiants.
 */
import pg from 'pg'
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('Usage : node scripts/apply-sql.mjs <fichier.sql>')
  process.exit(1)
}

const client = new pg.Client({
  host: '127.0.0.1',
  port: Number(process.env.PGPORT || 5435),
  user: process.env.PGUSER || 'supabase_admin',
  database: process.env.PGDATABASE || 'postgres',
  password: process.env.PGPASSWORD || '',
  connectionTimeoutMillis: 8000,
})

try {
  await client.connect()
  await client.query(readFileSync(file, 'utf8'))
  console.log('OK :', file)
} catch (e) {
  console.error('ÉCHEC :', file, '→', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
