/**
 * Script de migration DB via le pooler Supabase
 * Usage : node scripts/migrate-db.mjs
 */
import pg from 'pg'

const { Client } = pg

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.jdeslkxwbtqkeifrlmnf',
  password: 'Arcaykest82!',
  ssl: { rejectUnauthorized: false },
})

async function run() {
  await client.connect()
  console.log('✅ Connecté à Supabase')

  // Vérifier les colonnes existantes
  const { rows: existing } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'profiles' AND table_schema = 'public'
    ORDER BY ordinal_position;
  `)
  console.log('Colonnes actuelles profiles:', existing.map(r => r.column_name).join(', '))

  // Ajouter plan
  if (!existing.find(r => r.column_name === 'plan')) {
    await client.query(`
      ALTER TABLE public.profiles
        ADD COLUMN plan text DEFAULT 'scale'
        CHECK (plan IN ('starter', 'pro', 'scale'));
    `)
    console.log('✅ Colonne plan ajoutée')
  } else {
    console.log('⏭️  Colonne plan déjà existante')
  }

  // Ajouter role
  if (!existing.find(r => r.column_name === 'role')) {
    await client.query(`
      ALTER TABLE public.profiles
        ADD COLUMN role text DEFAULT 'user'
        CHECK (role IN ('user', 'admin'));
    `)
    console.log('✅ Colonne role ajoutée')
  } else {
    console.log('⏭️  Colonne role déjà existante')
  }

  await client.end()
  console.log('\n🎉 Migration terminée !')
}

run().catch(err => {
  console.error('❌ Erreur :', err.message)
  process.exit(1)
})
