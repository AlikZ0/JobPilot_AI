# Job site adapters

One adapter per job board. Site-specific DOM knowledge must never leak into shared
code — if a selector mentions a brand, it belongs in that brand's folder.

```
src/content/adapters/
  types.ts        the interface
  registry.ts     routing (first match wins, generic last)
  linkedin/
  indeed/
  glassdoor/
  generic/
```

## The interface

```ts
interface JobSiteAdapter {
  readonly id: string;
  readonly label: string;
  canHandle(url: string): boolean;
  isJobPage(context: AdapterContext): boolean;
  isListingPage(context: AdapterContext): boolean;
  extractJob(context: AdapterContext): Promise<ExtractedJob>;
  extractJobsFromListing(context: AdapterContext): Promise<JobSummary[]>;
  fillApplication?(context, mappings, fields): Promise<FillResult>;
}
```

`AdapterContext` is `{ doc, url, maxDescriptionChars }`, so adapters are pure with
respect to the document and can be tested against a static HTML string.

## Writing one

```ts
export class ExampleAdapter implements JobSiteAdapter {
  readonly id = 'example';
  readonly label = 'Example Jobs';

  canHandle(url: string) {
    return hostnameOf(url).endsWith('example.com');
  }

  isJobPage({ url, doc }: AdapterContext) {
    return /\/jobs\/\d+/.test(url) || Boolean(doc.querySelector('.job-detail'));
  }

  isListingPage({ doc }: AdapterContext) {
    return doc.querySelectorAll('.job-card').length > 2;
  }

  async extractJob(context: AdapterContext) {
    return extractJobFromDocument(
      { ...context, source: this.id },
      {
        title: text(context.doc, '.job-detail__title'),
        company: text(context.doc, '.job-detail__company'),
        description: elementText(context.doc.querySelector('.job-detail__body')),
        salaryText: text(context.doc, '.job-detail__salary'),
      },
    );
  }

  async extractJobsFromListing({ doc, url }: AdapterContext) {
    return Array.from(doc.querySelectorAll('.job-card')).flatMap((card) => {
      const href = card.querySelector('a')?.getAttribute('href');
      return href
        ? [
            {
              title: /* … */ '',
              company: '',
              location: '',
              url: normalizeUrl(absoluteUrl(href, url)),
              listingId: '',
              salaryHint: '',
            },
          ]
        : [];
    });
  }
}
```

Then add it to `ADAPTERS` in `registry.ts` — before `genericAdapter`, which always
claims the URL.

Hints are merged _under_ JSON-LD, so you only need selectors for the fields the
site does not publish as structured data.

## Generic adapter

Used for every unknown site. It relies entirely on the shared pipeline for
extraction and, for listings, collects same-origin links whose path looks like a
posting (`/job`, `/vacancy`, `/career`, `/position`, …), pulls company/location
text from the surrounding card, and de-duplicates by normalised URL.

## Testing an adapter

`tests/unit/adapters.test.ts` builds a happy-dom document from an HTML string and
asserts on the extraction result. No network, no browser, fast enough to run on
every commit:

```ts
const context = contextFor(html, 'https://example.com/jobs/1');
const job = await exampleAdapter.extractJob(context);
expect(job.company).toBe('Example Inc.');
```

Also assert that other adapters reject the URL, which is what keeps the routing
table honest.

## When a site changes

DOM breakage degrades rather than crashes: hints come back empty, the shared
heuristics take over, and `extractionQuality` drops. The side panel shows the
quality figure, so a sudden drop is the signal that an adapter needs updating.
