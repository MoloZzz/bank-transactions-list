import { buildExternalId } from './external-id';

describe('buildExternalId', () => {
  it('is deterministic for the same parts', () => {
    expect(buildExternalId(['monobank', '2026-06-01', -45000])).toBe(
      buildExternalId(['monobank', '2026-06-01', -45000]),
    );
  });

  it('is a 64-char sha256 hex string', () => {
    expect(buildExternalId(['a', 1])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any part changes', () => {
    const base = buildExternalId(['monobank', '2026-06-01', -45000]);
    expect(buildExternalId(['monobank', '2026-06-01', -45001])).not.toBe(base);
    expect(buildExternalId(['privat', '2026-06-01', -45000])).not.toBe(base);
  });

  it('is sensitive to part boundaries (no naive concatenation)', () => {
    expect(buildExternalId(['12', '34'])).not.toBe(buildExternalId(['1', '234']));
  });
});
