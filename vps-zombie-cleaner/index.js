const http = require('http')
const { execSync } = require('child_process')

const SECRET = process.env.ZOMBIE_CLEANER_SECRET || 'change-me'
const PORT = process.env.PORT || 3001
const CONTAINER = process.env.EVOLUTION_CONTAINER || 'whatsapp-test-evolutionapi-yfoofj-evolution-api-1'

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function deleteInstanceFromPrisma(instanceName) {
  const script = `
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.instance.findFirst({where:{name:'${instanceName}'}})
.then(i=>{
  if(!i){console.log('NOT_FOUND');process.exit(0);}
  return p.instance.delete({where:{id:i.id}}).then(()=>{console.log('DELETED');process.exit(0);});
})
.catch(e=>{console.error('ERR:'+e.message);process.exit(1);});
`.trim()

  // Écrire le script dans le container et l'exécuter
  execSync(`echo '${script.replace(/'/g, "'\\''")}' > /tmp/zombie_fix.js`)
  execSync(`docker cp /tmp/zombie_fix.js ${CONTAINER}:/evolution/zombie_fix.js`)
  const output = execSync(`docker exec -w /evolution ${CONTAINER} node zombie_fix.js`).toString().trim()
  log(`Prisma delete result for ${instanceName}: ${output}`)
  return output
}

const server = http.createServer((req, res) => {
  // Auth
  const secret = req.headers['x-zombie-secret']
  if (secret !== SECRET) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }

  // DELETE /instance/:name
  const match = req.url.match(/^\/instance\/([^/]+)$/)
  if (!match || req.method !== 'DELETE') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  const instanceName = decodeURIComponent(match[1])
  log(`Zombie cleanup requested for: ${instanceName}`)

  try {
    const result = deleteInstanceFromPrisma(instanceName)

    if (result === 'NOT_FOUND') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, message: 'Instance not found in Prisma (already clean)' }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, message: 'Instance deleted from Prisma' }))
    log(`Successfully cleaned zombie: ${instanceName}`)
  } catch (err) {
    log(`Error cleaning zombie ${instanceName}: ${err.message}`)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  log(`Zombie cleaner listening on 127.0.0.1:${PORT}`)
})
