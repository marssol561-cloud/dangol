type StoreRow = { store_id: string; name: string; address: string };

export type MasterStoreResult = { store_id: string; store_name: string; address: string };

export async function getMasterStoresSample(
  limit: number
): Promise<StoreRow[]> {
  // master DB의 실제 컬럼명은 store_name — PostgREST 별칭으로 name 으로 노출
  const url = `${process.env.MASTER_DB_URL}/rest/v1/stores?select=store_id,name:store_name,address&limit=${limit}`;
  const key = process.env.MASTER_DB_ANON_KEY!;

  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Master DB fetch failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<StoreRow[]>;
}

export async function searchMasterStores(
  name: string,
  address: string
): Promise<MasterStoreResult[]> {
  const params = new URLSearchParams({
    select: 'store_id,store_name,address',
    limit: '20',
  });
  if (name) params.append('store_name', `ilike.*${name}*`);
  if (address) params.append('address', `ilike.*${address}*`);

  const url = `${process.env.MASTER_DB_URL}/rest/v1/stores?${params.toString()}`;
  const key = process.env.MASTER_DB_ANON_KEY!;

  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Master DB search failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<MasterStoreResult[]>;
}
