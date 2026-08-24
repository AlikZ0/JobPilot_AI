import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { resolveAdapter, listAdapters, genericAdapter } from '@/content/adapters/registry';
import { linkedinAdapter } from '@/content/adapters/linkedin';
import { indeedAdapter } from '@/content/adapters/indeed';
import { glassdoorAdapter } from '@/content/adapters/glassdoor';
import type { AdapterContext } from '@/content/adapters/types';

function contextFor(html: string, url: string): AdapterContext {
  const window = new Window({ url });
  window.document.write(html);
  return { doc: window.document as unknown as Document, url, maxDescriptionChars: 6000 };
}

describe('выбор адаптера', () => {
  it.each([
    ['https://www.linkedin.com/jobs/view/123', 'linkedin'],
    ['https://de.indeed.com/viewjob?jk=1', 'indeed'],
    ['https://www.glassdoor.com/job-listing/x', 'glassdoor'],
    ['https://careers.acme.io/jobs/7', 'generic'],
  ])('URL %s достаётся адаптеру %s', (url, expected) => {
    expect(resolveAdapter(url).id).toBe(expected);
  });

  it('у каждого адаптера уникальный id', () => {
    const ids = listAdapters().map((adapter) => adapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('generic');
  });

  it('держит селекторы сайта внутри его адаптера', () => {
    expect(linkedinAdapter.canHandle('https://indeed.com/viewjob')).toBe(false);
    expect(indeedAdapter.canHandle('https://linkedin.com/jobs/view/1')).toBe(false);
    expect(glassdoorAdapter.canHandle('https://linkedin.com/jobs/view/1')).toBe(false);
    expect(genericAdapter.canHandle()).toBe(true);
  });
});

describe('адаптер LinkedIn', () => {
  const html = `<!doctype html><html><body>
    <h1 class="job-details-jobs-unified-top-card__job-title">Senior Vue Engineer</h1>
    <div class="job-details-jobs-unified-top-card__company-name">Acme</div>
    <li class="job-details-jobs-unified-top-card__job-insight"><span>Remote</span></li>
    <li class="job-details-jobs-unified-top-card__job-insight"><span>$120,000/yr - $150,000/yr</span></li>
    <div class="jobs-description__content"><p>${'We build things with Vue and TypeScript. '.repeat(12)}</p>
      <h3>Requirements</h3><ul><li>Vue experience required</li><li>TypeScript must have</li></ul></div>
  </body></html>`;

  it('распознаёт страницу вакансии', () => {
    const context = contextFor(html, 'https://www.linkedin.com/jobs/view/4012345678/');
    expect(linkedinAdapter.isJobPage(context)).toBe(true);
  });

  it('извлекает должность, компанию, зарплату и описание', async () => {
    const context = contextFor(html, 'https://www.linkedin.com/jobs/view/4012345678/');
    const job = await linkedinAdapter.extractJob(context);
    expect(job.title).toBe('Senior Vue Engineer');
    expect(job.company).toBe('Acme');
    expect(job.workMode).toBe('remote');
    expect(job.salary.min).toBe(120_000);
    expect(job.salary.period).toBe('year');
    expect(job.technologies).toEqual(expect.arrayContaining(['Vue', 'TypeScript']));
    expect(job.source).toBe('linkedin');
  });

  it('читает список результатов поиска', async () => {
    const listing = `<!doctype html><html><body><ul>
      <li class="jobs-search-results__list-item" data-job-id="1">
        <a class="job-card-container__link" href="/jobs/view/1?refId=x" aria-label="Node Developer"></a>
        <div class="job-card-container__primary-description">Acme</div>
        <div class="job-card-container__metadata-item">Remote</div>
      </li>
      <li class="jobs-search-results__list-item" data-job-id="2">
        <a class="job-card-container__link" href="/jobs/view/2" aria-label="Vue Developer"></a>
      </li>
    </ul></body></html>`;
    const jobs = await linkedinAdapter.extractJobsFromListing(
      contextFor(listing, 'https://www.linkedin.com/jobs/search/?keywords=node'),
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.title).toBe('Node Developer');
    expect(jobs[0]!.company).toBe('Acme');
    expect(jobs[0]!.url).toBe('https://linkedin.com/jobs/view/1');
  });
});

describe('адаптер Indeed', () => {
  const html = `<!doctype html><html><body>
    <h1 class="jobsearch-JobInfoHeader-title">Backend Developer</h1>
    <div data-testid="inlineHeader-companyName">Globex</div>
    <div data-testid="inlineHeader-companyLocation">Warsaw, Poland</div>
    <div id="salaryInfoAndJobType">PLN 18,000 - PLN 22,000 per month</div>
    <div id="jobDescriptionText"><p>${'Node.js and PostgreSQL work. '.repeat(15)}</p>
      <ul><li>Node.js required</li><li>Docker is a plus</li></ul></div>
  </body></html>`;

  it('извлекает вакансию', async () => {
    const job = await indeedAdapter.extractJob(
      contextFor(html, 'https://pl.indeed.com/viewjob?jk=abc'),
    );
    expect(job.title).toBe('Backend Developer');
    expect(job.company).toBe('Globex');
    expect(job.city).toBe('Warsaw');
    expect(job.salary.currency).toBe('PLN');
    expect(job.salary.min).toBe(18_000);
    expect(job.technologies).toEqual(expect.arrayContaining(['Node.js', 'PostgreSQL', 'Docker']));
  });

  it('читает список результатов', async () => {
    const listing = `<!doctype html><html><body>
      <div class="job_seen_beacon">
        <h2><a class="jcs-JobTitle" href="/viewjob?jk=abc" data-jk="abc"><span data-testid="job-title">Node Developer</span></a></h2>
        <span data-testid="company-name">Globex</span>
        <div data-testid="text-location">Remote</div>
      </div></body></html>`;
    const jobs = await indeedAdapter.extractJobsFromListing(
      contextFor(listing, 'https://pl.indeed.com/jobs?q=node'),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.listingId).toBe('abc');
    expect(jobs[0]!.company).toBe('Globex');
  });
});

describe('адаптер Glassdoor', () => {
  it('извлекает вакансию', async () => {
    const html = `<!doctype html><html><body>
      <h1 data-test="job-title">Platform Engineer</h1>
      <div data-test="employer-name">Initech</div>
      <div data-test="location">Remote, Europe</div>
      <div class="JobDetails_jobDescription__abc"><p>${'Kubernetes and Terraform work. '.repeat(15)}</p></div>
    </body></html>`;
    const job = await glassdoorAdapter.extractJob(
      contextFor(html, 'https://www.glassdoor.com/job-listing/platform-engineer-JV1.htm'),
    );
    expect(job.title).toBe('Platform Engineer');
    expect(job.company).toBe('Initech');
    expect(job.technologies).toEqual(expect.arrayContaining(['Kubernetes', 'Terraform']));
  });
});

describe('общий адаптер', () => {
  it('собирает ссылки на вакансии того же домена на незнакомом сайте', async () => {
    const listing = `<!doctype html><html><body>
      <a href="/jobs/senior-node-developer">Senior Node Developer</a>
      <a href="/jobs/vue-developer">Vue Developer</a>
      <a href="/about">About us</a>
      <a href="https://other.test/jobs/x">External job</a>
    </body></html>`;
    const jobs = await genericAdapter.extractJobsFromListing(
      contextFor(listing, 'https://careers.acme.io/jobs'),
    );
    expect(jobs.map((job) => job.title)).toEqual(['Senior Node Developer', 'Vue Developer']);
  });

  it('убирает повторяющиеся ссылки', async () => {
    const listing = `<!doctype html><html><body>
      <a href="/jobs/1?utm_source=a">Role</a><a href="/jobs/1?utm_source=b">Role</a>
    </body></html>`;
    const jobs = await genericAdapter.extractJobsFromListing(
      contextFor(listing, 'https://careers.acme.io/jobs'),
    );
    expect(jobs).toHaveLength(1);
  });
});
