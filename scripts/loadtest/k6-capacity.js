/**
 * Load test k6 — mesure le point de rupture du VPS Xeyo.
 *
 * ⚠️ NON-FACTURABLE PAR DÉFAUT : le scénario par défaut ne tape que des endpoints
 * qui NE déclenchent NI OpenAI NI envoi WhatsApp. On mesure la capacité HTTP +
 * la pression sur le pool de connexions Postgres, pas le coût IA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INSTALLATION (une fois) :
 *   Windows : winget install k6 --source winget    (ou : choco install k6)
 *   macOS   : brew install k6
 *   Linux   : voir https://k6.io/docs/get-started/installation/
 *
 * LANCEMENT :
 *   # 1) contre la PROD (endpoints sains only — sûr) :
 *   k6 run -e BASE_URL=https://app.xeyo.io scripts/loadtest/k6-capacity.js
 *
 *   # 2) en montant la charge (ramp jusqu'à 200 utilisateurs virtuels) :
 *   k6 run -e BASE_URL=https://app.xeyo.io -e PROFILE=stress scripts/loadtest/k6-capacity.js
 *
 *   # 3) scénario webhook (⚠️ à réserver au STAGING avec clé OpenAI de test/mock,
 *   #    car il déclenche le vrai hot path IA — NE PAS lancer en prod) :
 *   k6 run -e BASE_URL=https://staging.xeyo.io -e SCENARIO=webhook \
 *          -e WABA_VERIFY_TOKEN=xxx scripts/loadtest/k6-capacity.js
 *
 * VARIABLES D'ENV :
 *   BASE_URL           (requis) URL de base, ex. https://app.xeyo.io
 *   PROFILE            smoke | load | stress | spike   (défaut: load)
 *   SCENARIO           safe | webhook                  (défaut: safe)
 *   WABA_VERIFY_TOKEN  token de vérif webhook (utile si SCENARIO=webhook)
 *
 * QUE REGARDER DANS LE RAPPORT :
 *   - http_req_duration p(95)/p(99) : quand ça explose = point de saturation
 *   - http_req_failed : apparition de 5xx = pool DB saturé / process qui rame
 *   - le palier de VUs où ça arrive = ta capacité réelle
 *   En parallèle, sur le VPS : `SELECT count(*) FROM pg_stat_activity;` et
 *   la CPU/RAM (htop) pour corréler.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

// Le webhook GET renvoie 403 quand le verify_token est faux (cas normal de ce
// test). Sans ça, k6 compterait tout 4xx comme "échec HTTP" et gonflerait
// http_req_failed. On déclare 200-499 comme "attendus" : seuls les 5xx (vraie
// défaillance serveur) comptent comme échec.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }))

const BASE_URL = (__ENV.BASE_URL || '').replace(/\/$/, '')
const PROFILE = __ENV.PROFILE || 'load'
const SCENARIO = __ENV.SCENARIO || 'safe'
const WABA_VERIFY_TOKEN = __ENV.WABA_VERIFY_TOKEN || 'loadtest-token'

if (!BASE_URL) {
  throw new Error('BASE_URL requis. Ex: k6 run -e BASE_URL=https://app.xeyo.io scripts/loadtest/k6-capacity.js')
}

const errorRate = new Rate('errors')

// ── Profils de charge (ramp-up progressif) ────────────────────────────────────
const PROFILES = {
  // Vérif rapide que tout répond (dev).
  smoke: { stages: [{ duration: '30s', target: 5 }] },
  // Charge nominale : monte à 50 VUs, tient, redescend.
  load: {
    stages: [
      { duration: '1m', target: 20 },
      { duration: '2m', target: 50 },
      { duration: '2m', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },
  // Stress : pousse jusqu'à 200 VUs pour trouver le point de rupture.
  stress: {
    stages: [
      { duration: '1m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '2m', target: 200 },
      { duration: '2m', target: 200 },
      { duration: '1m', target: 0 },
    ],
  },
  // Spike : pic brutal (simule un envoi de campagne / afflux soudain).
  spike: {
    stages: [
      { duration: '10s', target: 10 },
      { duration: '20s', target: 200 },
      { duration: '30s', target: 200 },
      { duration: '10s', target: 0 },
    ],
  },
}

export const options = {
  stages: (PROFILES[PROFILE] || PROFILES.load).stages,
  // Expose p99 dans le résumé (par défaut k6 ne calcule que p90/p95).
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    // Seuils d'alerte : au-delà, on considère le palier comme saturé.
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.02'], // <2% de VRAIES erreurs (5xx uniquement)
    errors: ['rate<0.05'],
  },
}

// ── Scénario SAFE (défaut) : endpoints non-facturables ────────────────────────
// Le webhook GET est la vérification Meta : renvoie hub.challenge instantanément,
// AUCUN accès DB, AUCUN appel IA/WhatsApp. Idéal pour mesurer le débit HTTP pur
// et la latence de routing Next.js sous charge.
function safeScenario() {
  const verifyUrl =
    `${BASE_URL}/api/webhook/waba` +
    `?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(WABA_VERIFY_TOKEN)}` +
    `&hub.challenge=k6ping`
  const res = http.get(verifyUrl, { tags: { name: 'webhook_verify' } })
  // 200 (token bon) ou 403 (token faux) sont tous deux des réponses "saines" :
  // le serveur a routé + répondu vite. On ne valide que "pas de 5xx".
  const ok = check(res, {
    'status < 500': (r) => r.status < 500,
  })
  errorRate.add(!ok)

  // Page d'accueil (server component léger) : mesure le rendu SSR sous charge.
  const home = http.get(`${BASE_URL}/`, { tags: { name: 'home' } })
  errorRate.add(!check(home, { 'home < 500': (r) => r.status < 500 }))

  sleep(1)
}

// ── Scénario WEBHOOK (staging only) : POST webhook = hot path IA complet ───────
// ⚠️ Déclenche processAIResponse → appels OpenAI RÉELS. NE JAMAIS lancer en prod.
// À réserver à un staging avec clé OpenAI de test ou mock.
function webhookScenario() {
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'LOADTEST',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: 'LOADTEST_PHONE_ID' },
              contacts: [{ profile: { name: 'k6 tester' }, wa_id: '33600000000' }],
              messages: [
                {
                  from: '33600000000',
                  id: `wamid.k6.${__VU}.${__ITER}`,
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'Bonjour, ceci est un test de charge.' },
                },
              ],
            },
          },
        ],
      },
    ],
  })
  const res = http.post(`${BASE_URL}/api/webhook/waba`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'webhook_inbound' },
  })
  // Le webhook doit répondre 200 vite (le traitement IA est en arrière-plan).
  errorRate.add(!check(res, { 'webhook < 500': (r) => r.status < 500 }))
  sleep(1)
}

export default function () {
  if (SCENARIO === 'webhook') webhookScenario()
  else safeScenario()
}

// Résumé lisible en fin de run (en plus du rapport k6 standard).
export function handleSummary(data) {
  const m = data.metrics
  const dur = m.http_req_duration ? m.http_req_duration.values : {}
  const p95 = dur['p(95)'] || 0
  const p99 = dur['p(99)'] || 0
  const failed = m.http_req_failed ? m.http_req_failed.values.rate : 0
  const reqs = m.http_reqs ? m.http_reqs.values.count : 0
  const line = (s) => s + '\n'
  let out = ''
  out += line('──────────────────────────────────────────────')
  out += line(` XEYO LOAD TEST — profil=${PROFILE} scénario=${SCENARIO}`)
  out += line('──────────────────────────────────────────────')
  out += line(` Requêtes totales : ${reqs}`)
  out += line(` Latence p95      : ${Math.round(p95)} ms`)
  out += line(` Latence p99      : ${Math.round(p99)} ms`)
  out += line(` Taux d'erreur    : ${(failed * 100).toFixed(2)} %`)
  out += line('──────────────────────────────────────────────')
  out += line(' Lecture : si p95 dépasse ~1500ms ou erreurs > 2%,')
  out += line(' le palier de VUs atteint = ta capacité de rupture.')
  out += line('──────────────────────────────────────────────')
  return {
    stdout: out,
    'scripts/loadtest/last-run-summary.json': JSON.stringify(data, null, 2),
  }
}
