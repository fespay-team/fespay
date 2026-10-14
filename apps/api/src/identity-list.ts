import type { PoolClient } from 'pg';
import { ApiError } from './http-input.js';

// Only these fields enter the adapter. Do not select OAuth tokens or PW hashes.
export async function listIdentities(client: PoolClient, userId: string, now: number) {
  const rows = (
    await client.query(
      `SELECT "fespayIdentityId", "providerId", "accountId", "createdAt",
      length(password)>0 AS has_password
     FROM auth.account WHERE "userId"=$1
     ORDER BY "providerId", "fespayIdentityId" LIMIT 3 FOR SHARE`,
      [userId],
    )
  ).rows;
  const providers = new Set<string>();
  if (!rows.length || rows.length > 2) throw new ApiError('DEPENDENCY_UNAVAILABLE', 503, true);
  const items = rows.map((row) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        row.fespayIdentityId,
      ) ||
      providers.has(row.providerId) ||
      (row.providerId !== 'credential' && row.providerId !== 'google') ||
      (row.providerId === 'credential' && (!row.has_password || row.accountId !== userId)) ||
      (row.providerId === 'google' && !row.accountId)
    )
      throw new ApiError('DEPENDENCY_UNAVAILABLE', 503, true);
    providers.add(row.providerId);
    return {
      identity_id: row.fespayIdentityId,
      provider: row.providerId === 'credential' ? 'EMAIL_PASSWORD' : 'GOOGLE',
      linked_at: row.createdAt.toISOString(),
    };
  });
  return { items, checked_at: new Date(now).toISOString() };
}
