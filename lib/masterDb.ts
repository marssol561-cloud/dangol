type StoreRow = { store_id: string; name: string; address: string };

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
