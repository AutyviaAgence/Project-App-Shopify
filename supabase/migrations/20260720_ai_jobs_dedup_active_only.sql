-- La déduplication des jobs IA ne doit couvrir que les jobs ENCORE VIVANTS.
--
-- ⚠️ LE PROBLÈME : DES CLIENTS N'ONT JAMAIS LEUR RÉPONSE.
--
-- `processAIResponse` ne pose `ai_processed = true` qu'à la toute fin. Or une
-- dizaine de sorties anticipées existent (erreur OpenAI, quota atteint, limite
-- de tokens, 10 tours d'outils sans réponse…). Le message reste donc
-- `ai_processed = false`, et le filet `recoverOrphanedAiReplies` le repère
-- bien — il tente de le remettre en file.
--
-- Mais il réutilise la MÊME clé de dédup (`wa_message_id`), et cet index unique
-- était GLOBAL : le job échoué gardait sa clé à vie, donc le ré-enfilement
-- échouait en 23505, silencieusement avalé comme « déjà enfilé ». Le filet de
-- sécurité ne pouvait STRUCTURELLEMENT pas rattraper ce qu'il détectait.
--
-- En restreignant l'index aux statuts actifs, la clé se libère dès qu'un job
-- termine en échec : le rattrapage fonctionne enfin. La protection anti-doublon
-- reste entière pour les jobs en cours (rafale de webhooks Meta), qui est le
-- seul cas qu'elle devait couvrir.
DROP INDEX IF EXISTS idx_ai_jobs_dedup;

-- Statuts de `ai_jobs` : pending | sent | failed (cf. 20260703_ai_jobs.sql:25).
-- Seul `pending` est « vivant » : `sent` est terminé, `failed` doit justement
-- pouvoir être ré-enfilé par le rattrapage.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_jobs_dedup
  ON ai_jobs(dedup_key)
  WHERE dedup_key IS NOT NULL
    AND status = 'pending';

NOTIFY pgrst, 'reload schema';
