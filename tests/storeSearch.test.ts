import { describe, it, expect } from 'vitest';
import { searchMasterStores } from '../lib/masterDb';

describe('test_master_store_search', () => {
  it('returns array of {store_id, store_name, address} with ≤ 20 items', async () => {
    const results = await searchMasterStores('', '');

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(20);

    if (results.length > 0) {
      const first = results[0];
      expect(typeof first.store_id).toBe('string');
      expect(typeof first.store_name).toBe('string');
      expect(typeof first.address).toBe('string');
      // Must NOT include unexpected keys (like the old 'name' alias)
      expect('name' in first).toBe(false);
    }
  });

  it('filters by name when provided', async () => {
    const allResults = await searchMasterStores('', '');
    if (allResults.length === 0) return; // no data in master DB → skip

    const nameFragment = allResults[0].store_name.slice(0, 2);
    const filtered = await searchMasterStores(nameFragment, '');

    expect(Array.isArray(filtered)).toBe(true);
    filtered.forEach((r) => {
      expect(r.store_name.toLowerCase()).toContain(nameFragment.toLowerCase());
    });
  });
});
