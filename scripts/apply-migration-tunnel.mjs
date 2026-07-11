/**
 * Applique un fichier de migration SQL via le tunnel SSH (127.0.0.1:5435).
 * Usage : node scripts/apply-migration-tunnel.mjs supabase/migrations/<fichier>.sql
 * Lancé depuis la racine du projet (pour résoudre le module `pg`).
 * Le mot de passe est lu dans PGPASSWORD.
 */
import pg from 'pg'
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('Usage: node scripts/apply-migration-tunnel.mjs <fichier.sql>'); process.exit(1) }
const sql = readFileSync(file, 'utf8')

const client = new pg.Client({
  host: '127.0.0.1', port: 5435,
  user: process.env.PGUSER || 'supabase_admin',
  database: process.env.PGDATABASE || 'postgres',
  password: process.env.PGPASSWORD || '',
  connectionTimeoutMillis: 6000,
})

try {
  await client.connect()
  const who = await client.query('select current_user')
  console.log('Connecté en tant que', who.rows[0].current_user)
  console.log(`Application de ${file} …`)
  await client.query(sql)
  console.log('✅ Migration appliquée.')
  // Vérif : la colonne est-elle bien nullable maintenant ?
  const check = await client.query(`
    select is_nullable from information_schema.columns
    where table_name='contacts' and column_name='phone_number'`)
  console.log('contacts.phone_number is_nullable =', check.rows[0]?.is_nullable)
} catch (e) {
  console.error('❌ Échec :', e.message)
  process.exit(1)
} finally {
  await client.end()
}
