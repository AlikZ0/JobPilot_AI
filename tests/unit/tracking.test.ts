import { describe, expect, it } from 'vitest';
import {
  formLooksLikeApplication,
  looksLikeSiteAppliedMarker,
  looksLikeSubmissionSuccess,
} from '@/content/tracking';

function formFrom(html: string): HTMLFormElement {
  document.body.innerHTML = html;
  const form = document.querySelector('form');
  if (!form) throw new Error('в разметке нет формы');
  return form as HTMLFormElement;
}

describe('распознавание отправленного отклика', () => {
  it('видит благодарность после отправки на русском и английском', () => {
    expect(looksLikeSubmissionSuccess('Спасибо за отклик!')).toBe(true);
    expect(looksLikeSubmissionSuccess('Ваш отклик отправлен работодателю')).toBe(true);
    expect(looksLikeSubmissionSuccess('Заявка успешно отправлена')).toBe(true);
    expect(looksLikeSubmissionSuccess('Your application has been submitted')).toBe(true);
    expect(looksLikeSubmissionSuccess('Thanks for applying!')).toBe(true);
  });

  it('не принимает за отклик обычный текст страницы', () => {
    expect(looksLikeSubmissionSuccess('Спасибо за подписку на рассылку')).toBe(false);
    expect(looksLikeSubmissionSuccess('Отправить резюме работодателю')).toBe(false);
    expect(looksLikeSubmissionSuccess('Submit your application below')).toBe(false);
    expect(looksLikeSubmissionSuccess('')).toBe(false);
  });

  it('читает метку сайта только в короткой надписи', () => {
    expect(looksLikeSiteAppliedMarker('Вы откликались')).toBe(true);
    expect(looksLikeSiteAppliedMarker('Applied')).toBe(true);
    expect(looksLikeSiteAppliedMarker('Отклик отправлен 12 марта')).toBe(true);
    // Та же фраза внутри длинного описания — не метка, а текст вакансии.
    expect(
      looksLikeSiteAppliedMarker(
        'Вы откликались на подобные вакансии раньше, поэтому мы советуем вам обратить внимание на этот раздел с описанием условий работы',
      ),
    ).toBe(false);
  });
});

describe('распознавание формы отклика', () => {
  it('узнаёт форму отклика по полям и подписям', () => {
    const form = formFrom(`
      <form id="apply-form">
        <label>Имя<input name="first_name" /></label>
        <label>Email<input name="email" type="email" /></label>
        <label>Сопроводительное письмо<textarea name="cover_letter"></textarea></label>
        <button type="submit">Откликнуться</button>
      </form>
    `);
    expect(formLooksLikeApplication(form)).toBe(true);
  });

  it('не считает откликом форму поиска', () => {
    const form = formFrom(`
      <form role="search">
        <input name="query" placeholder="Поиск вакансий" />
        <input name="region" placeholder="Регион" />
        <button type="submit">Найти</button>
      </form>
    `);
    expect(formLooksLikeApplication(form)).toBe(false);
  });

  it('не считает откликом подписку на рассылку', () => {
    const form = formFrom(`
      <form class="newsletter">
        <input name="email" type="email" placeholder="Ваш email" />
        <input name="consent" type="checkbox" />
        <button type="submit">Подписаться на рассылку</button>
      </form>
    `);
    expect(formLooksLikeApplication(form)).toBe(false);
  });

  it('не срабатывает на форме с одним полем', () => {
    const form = formFrom(`
      <form>
        <input name="resume" placeholder="Резюме" />
      </form>
    `);
    expect(formLooksLikeApplication(form)).toBe(false);
  });
});
