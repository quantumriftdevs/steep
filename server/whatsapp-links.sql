-- WhatsApp B1: run only after approval, in project sbdygndipzibujcobgiy.
BEGIN;
CREATE TABLE public.whatsapp_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  link_code text NOT NULL UNIQUE CHECK (link_code ~ '^[A-Z0-9]{6,8}$'),
  wa_id text UNIQUE CHECK (wa_id ~ '^[1-9][0-9]{6,14}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','linked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  CHECK ((status = 'pending' AND wa_id IS NULL AND linked_at IS NULL)
      OR (status = 'linked' AND wa_id IS NOT NULL AND linked_at IS NOT NULL))
);
ALTER TABLE public.whatsapp_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_links TO service_role;
-- The UNIQUE constraint on wa_id already creates its lookup index.
CREATE TABLE public.whatsapp_inbound_log (
  message_sid text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_inbound_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_inbound_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_inbound_log TO service_role;
COMMIT;
