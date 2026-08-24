import { describe, expect, it } from 'vitest';
import {
  descriptionHash,
  findDuplicate,
  fingerprintOf,
  jobFingerprint,
  listingIdFromUrl,
  normalizeCompany,
  normalizeTitle,
} from '@/core/extraction/fingerprint';
import { jobSchema, type Job } from '@/types/job';
import { normalizeUrl } from '@/utils/url';
import { makeJob } from '../fixtures/jobs';

function toJob(overrides = {}): Job {
  const extracted = makeJob(overrides);
  return jobSchema.parse({
    ...extracted,
    id: `job_${Math.random().toString(36).slice(2)}`,
    fingerprint: fingerprintOf(extracted),
    discoveredAt: Date.now(),
    updatedAt: Date.now(),
  });
}

describe('normalisation', () => {
  it('strips noise from titles', () => {
    expect(normalizeTitle('Senior Node.js Developer (m/f/d) — Remote')).toBe(
      'senior node.js developer',
    );
  });

  it('strips legal suffixes from company names', () => {
    expect(normalizeCompany('Example Inc.')).toBe('example');
    expect(normalizeCompany('Acme GmbH')).toBe('acme');
  });

  it('removes tracking parameters from URLs', () => {
    expect(normalizeUrl('https://www.Example.com/jobs/1?utm_source=x&id=5#top')).toBe(
      'https://example.com/jobs/1?id=5',
    );
  });

  it('extracts board listing ids', () => {
    expect(listingIdFromUrl('https://indeed.com/viewjob?jk=abc123')).toBe('abc123');
    expect(listingIdFromUrl('https://linkedin.com/jobs/view/3912345678')).toBe('3912345678');
  });
});

describe('fingerprints', () => {
  it('matches the same posting across two job boards', () => {
    const linkedin = makeJob({ url: 'https://linkedin.com/jobs/view/1?trk=abc' });
    const indeed = makeJob({
      url: 'https://indeed.com/viewjob?jk=zzz',
      title: 'Senior Node.js Developer (m/f/d)',
      company: 'Example Inc',
    });
    expect(fingerprintOf(linkedin)).toBe(fingerprintOf(indeed));
  });

  it('separates different roles at the same company', () => {
    const a = makeJob();
    const b = makeJob({ title: 'Senior Python Developer' });
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
  });

  it('falls back to the URL when the company is unknown', () => {
    const fingerprint = jobFingerprint({
      title: 'Dev',
      company: '',
      location: '',
      url: 'https://x.test/a',
      description: 'text',
    });
    expect(fingerprint.startsWith('u:')).toBe(true);
  });

  it('hashes descriptions stably regardless of whitespace', () => {
    expect(descriptionHash('Hello   world\n\n')).toBe(descriptionHash('hello world'));
  });
});

describe('duplicate detection', () => {
  it('detects an exact fingerprint duplicate', () => {
    const existing = toJob();
    const match = findDuplicate(makeJob(), [existing]);
    expect(match?.reason).toBe('fingerprint');
    expect(match?.confidence).toBe(1);
  });

  it('detects a duplicate by URL when titles differ', () => {
    const existing = toJob();
    const candidate = makeJob({ title: 'Completely Different Heading', company: 'Other Co' });
    const match = findDuplicate(candidate, [existing]);
    expect(match?.reason).toBe('url');
  });

  it('detects near-duplicates from the same company', () => {
    const existing = toJob();
    const candidate = makeJob({
      url: 'https://other.test/job/9',
      title: 'Senior Node.js Developer - Remote',
    });
    const match = findDuplicate(candidate, [existing]);
    expect(match).not.toBeNull();
    expect(match!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('does not treat unrelated postings as duplicates', () => {
    const existing = toJob();
    const candidate = makeJob({
      url: 'https://other.test/job/42',
      title: 'Marketing Manager',
      company: 'Different Company',
      description: 'Marketing role with no engineering content at all.',
    });
    expect(findDuplicate(candidate, [existing])).toBeNull();
  });
});
