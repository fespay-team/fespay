-- Better Auth 1.7.7 account.additionalFields.fespayIdentityId.
-- Keep existing provider identifiers, hashes and tokens; assign a separate
-- stable public UUID. This is applied only by the guarded development runner.
ALTER TABLE auth.account ADD COLUMN "fespayIdentityId" text NOT NULL
  DEFAULT gen_random_uuid()::text
  CONSTRAINT account_fespay_identity_id_unique UNIQUE
  CONSTRAINT account_fespay_identity_id_uuid CHECK (
    "fespayIdentityId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );
