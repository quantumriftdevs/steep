-- B2: apply only after approval. No web chats/projects schema changes.
BEGIN;
CREATE TABLE public.whatsapp_chat_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  next_reply_at timestamptz NOT NULL DEFAULT now(),
  messages jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(messages) = 'array' AND jsonb_array_length(messages) <= 12
      AND octet_length(messages::text) <= 96000)
);
ALTER TABLE public.whatsapp_chat_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_chat_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_chat_state TO service_role;
COMMIT;
