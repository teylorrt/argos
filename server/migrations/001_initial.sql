CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY,
  installation_id uuid NOT NULL UNIQUE,
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  credential_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS enrollments (
  id uuid PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  installation_id uuid
);
CREATE TABLE IF NOT EXISTS observations (
  id bigserial PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES devices(id),
  event_id uuid NOT NULL,
  envelope text NOT NULL,
  envelope_hash text NOT NULL,
  schema_version integer NOT NULL,
  app text NOT NULL,
  source text NOT NULL,
  simulated boolean NOT NULL,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, event_id)
);
CREATE INDEX IF NOT EXISTS observations_filters ON observations(app, source, id DESC);
CREATE INDEX IF NOT EXISTS observations_retention ON observations(received_at);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  action text NOT NULL,
  subject_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
