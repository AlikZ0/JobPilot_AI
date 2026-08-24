# Адаптеры job-сайтов

По одному адаптеру на сайт. Знание о DOM конкретного сайта не должно протекать в
общий код: если в селекторе есть название бренда, ему место в папке этого бренда.

```
src/content/adapters/
  types.ts        интерфейс
  registry.ts     маршрутизация (побеждает первый подошедший, общий — последний)
  linkedin/
  indeed/
  glassdoor/
  generic/
```

## Интерфейс

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

`AdapterContext` — это `{ doc, url, maxDescriptionChars }`, поэтому адаптеры
чисты относительно документа и тестируются на статической HTML-строке.

## Как написать свой

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

Затем добавьте его в `ADAPTERS` в `registry.ts` — до `genericAdapter`, который
принимает любой URL.

Подсказки сливаются **под** JSON-LD, поэтому селекторы нужны только для тех полей,
которые сайт не публикует в структурированном виде.

## Общий адаптер

Используется для всех незнакомых сайтов. Извлечение он целиком отдаёт общему
конвейеру, а для списков собирает ссылки того же домена, путь которых похож на
вакансию (`/job`, `/vacancy`, `/career`, `/position`, …), подтягивает название
компании и локацию из окружающей карточки и убирает дубли по нормализованному URL.

## Как тестировать адаптер

`tests/unit/adapters.test.ts` строит документ happy-dom из HTML-строки и проверяет
результат извлечения. Ни сети, ни браузера — достаточно быстро, чтобы гонять на
каждом коммите:

```ts
const context = contextFor(html, 'https://example.com/jobs/1');
const job = await exampleAdapter.extractJob(context);
expect(job.company).toBe('Example Inc.');
```

Заодно проверяйте, что другие адаптеры этот URL отклоняют, — именно это держит
таблицу маршрутизации честной.

## Когда сайт меняется

Поломка вёрстки приводит к деградации, а не к падению: подсказки возвращаются
пустыми, работу берут на себя общие эвристики, а `extractionQuality` падает.
Боковая панель показывает это число, поэтому резкое падение — сигнал, что адаптер
пора обновить.
