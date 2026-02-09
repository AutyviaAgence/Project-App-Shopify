-- Migration : Ajout du support média dans les messages
-- Date : 2026-02-09
-- Description : Ajouter les colonnes transcription et media_mime_type pour
-- stocker les transcriptions IA séparément et le type MIME des médias.

-- Colonne transcription : stocke le texte IA (Whisper/Vision) séparé du content
-- Chiffré avec encryptMessage() comme le content
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcription TEXT;

-- Colonne media_mime_type : permet au frontend de savoir comment rendre le média
-- (audio/ogg → lecteur audio, image/jpeg → <img>, application/pdf → téléchargement)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_mime_type TEXT;

-- Index pour requêtes optimisées sur les messages avec média
CREATE INDEX IF NOT EXISTS idx_messages_media_type
  ON messages(conversation_id, message_type)
  WHERE message_type IN ('image', 'audio', 'video', 'document');
