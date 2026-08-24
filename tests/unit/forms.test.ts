import { describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { analyzeForms, hasApplicationForm } from '@/content/forms/analyzer';
import { fillFields } from '@/content/forms/filler';
import {
  AUTOFILL_CONFIDENCE_THRESHOLD,
  buildDeterministicPlan,
  classifyField,
  mergeAIMappings,
  NEVER_AUTOFILL,
} from '@/core/application/fieldMapper';
import { readProfilePath } from '@/core/application/profilePaths';
import { makeProfile } from '../fixtures/profile';

const FORM_HTML = `<!doctype html><html><body>
<form>
  <label for="fn">First name</label><input id="fn" name="first_name" />
  <label for="ln">Last name</label><input id="ln" name="last_name" />
  <label for="em">Email address</label><input id="em" type="email" autocomplete="email" />
  <label for="ph">Phone</label><input id="ph" type="tel" />
  <label for="li">LinkedIn profile</label><input id="li" />
  <label for="gh">GitHub</label><input id="gh" />
  <label for="sal">Expected salary (monthly)</label><input id="sal" type="number" />
  <label for="yrs">Years of experience</label><input id="yrs" type="number" />
  <label for="cty">City</label><input id="cty" />
  <label for="cn">Country</label>
  <select id="cn"><option value="">Choose</option><option value="pl">Poland</option><option value="de">Germany</option></select>
  <label for="cl">Cover letter</label><textarea id="cl"></textarea>
  <label for="gender">Gender</label>
  <select id="gender"><option>Prefer not to say</option><option>Female</option><option>Male</option></select>
  <label for="rl">Are you willing to relocate?</label>
  <select id="rl"><option>No</option><option>Yes</option></select>
  <label for="tos"><input id="tos" type="checkbox" /> I agree to the privacy policy</label>
  <label for="mystery">Tell us about the hardest bug you fixed</label><textarea id="mystery"></textarea>
  <input type="submit" value="Submit application" />
</form>
</body></html>`;

function documentFrom(html: string): Document {
  const window = new Window({ url: 'https://jobs.example.com/apply' });
  window.document.write(html);
  return window.document as unknown as Document;
}

describe('form analyzer', () => {
  it('detects every fillable control and skips submit buttons', () => {
    const fields = analyzeForms(documentFrom(FORM_HTML));
    const names = fields.map((field) => field.idAttr);
    expect(names).toEqual(
      expect.arrayContaining([
        'fn',
        'ln',
        'em',
        'ph',
        'li',
        'gh',
        'sal',
        'yrs',
        'cty',
        'cn',
        'cl',
        'tos',
      ]),
    );
    expect(fields.some((field) => field.inputType === 'submit')).toBe(false);
  });

  it('reads labels, options and required flags', () => {
    const fields = analyzeForms(documentFrom(FORM_HTML));
    const country = fields.find((field) => field.idAttr === 'cn');
    expect(country?.label).toBe('Country');
    expect(country?.kind).toBe('select');
    expect(country?.options.map((option) => option.label)).toContain('Poland');
  });

  it('recognises application forms', () => {
    expect(hasApplicationForm(documentFrom(FORM_HTML))).toBe(true);
    expect(hasApplicationForm(documentFrom('<html><body><input name="q" /></body></html>'))).toBe(
      false,
    );
  });
});

describe('field mapper', () => {
  const doc = documentFrom(FORM_HTML);
  const fields = analyzeForms(doc);
  const profile = makeProfile();

  it('maps standard fields to profile paths with high confidence', () => {
    const plan = buildDeterministicPlan(fields, profile, { requireConfirmation: false });
    const byId = new Map(plan.mappings.map((mapping) => [mapping.fieldId, mapping]));
    const find = (idAttr: string) =>
      byId.get(fields.find((field) => field.idAttr === idAttr)!.fieldId)!;

    expect(find('fn').profilePath).toBe('personal.firstName');
    expect(find('fn').value).toBe('Alex');
    expect(find('em').fieldType).toBe('email');
    expect(find('em').value).toBe('alex@example.com');
    expect(find('gh').profilePath).toBe('links.github');
    expect(find('sal').fieldType).toBe('expected_salary');
    expect(find('sal').value).toBe('3500');
    expect(find('yrs').value).toBe('5');
    expect(find('cn').value).toBe('Poland');
    expect(find('fn').confidence).toBeGreaterThanOrEqual(AUTOFILL_CONFIDENCE_THRESHOLD);
  });

  it('never auto-fills demographic or consent fields', () => {
    const plan = buildDeterministicPlan(fields, profile, { requireConfirmation: false });
    const gender = plan.mappings.find((mapping) => mapping.fieldType === 'gender');
    const consent = plan.mappings.find((mapping) => mapping.fieldType === 'consent');
    expect(gender?.decision).toBe('skipped');
    expect(consent?.decision).toBe('skipped');
    for (const type of NEVER_AUTOFILL) {
      const mapping = plan.mappings.find((entry) => entry.fieldType === type);
      if (mapping) expect(mapping.decision).not.toBe('auto');
    }
  });

  it('routes unrecognised free-text fields to the AI queue', () => {
    const plan = buildDeterministicPlan(fields, profile, { requireConfirmation: false });
    expect(plan.unknownFields.some((field) => field.idAttr === 'mystery')).toBe(true);
  });

  it('requires confirmation when the setting is on', () => {
    const plan = buildDeterministicPlan(fields, profile, { requireConfirmation: true });
    expect(plan.mappings.filter((mapping) => mapping.decision === 'auto')).toHaveLength(0);
  });

  it('classifies an unlabelled textarea as an open question', () => {
    const doc2 = documentFrom('<html><body><textarea id="x"></textarea></body></html>');
    const [field] = analyzeForms(doc2);
    expect(classifyField(field!).fieldType).toBe('open_question');
  });

  it('does not let a low-confidence AI suggestion auto-fill', () => {
    const plan = buildDeterministicPlan(fields, profile, { requireConfirmation: false });
    const mystery = fields.find((field) => field.idAttr === 'mystery')!;
    const merged = mergeAIMappings(
      plan.mappings,
      [
        {
          fieldId: mystery.fieldId,
          fieldType: 'open_question',
          profilePath: 'professional.summary',
          confidence: 0.55,
          reason: 'guess',
        },
      ],
      fields,
      profile,
      { requireConfirmation: false },
    );
    const mapping = merged.find((entry) => entry.fieldId === mystery.fieldId);
    expect(mapping?.decision).toBe('needs_confirmation');
  });

  it('lets a confident AI suggestion fill an unknown field', () => {
    const plan = buildDeterministicPlan(fields, profile, { requireConfirmation: false });
    const mystery = fields.find((field) => field.idAttr === 'mystery')!;
    const merged = mergeAIMappings(
      plan.mappings,
      [
        {
          fieldId: mystery.fieldId,
          fieldType: 'current_position',
          profilePath: 'professional.currentPosition',
          confidence: 0.95,
          reason: 'label mentions current role',
        },
      ],
      fields,
      profile,
      { requireConfirmation: false },
    );
    const mapping = merged.find((entry) => entry.fieldId === mystery.fieldId);
    expect(mapping?.decision).toBe('auto');
    expect(mapping?.value).toBe('Fullstack Developer');
  });

  it('resolves every documented profile path without throwing', () => {
    expect(readProfilePath(profile, 'personal.fullName')).toBe('Alex Doe');
    expect(readProfilePath(profile, 'languages.list')).toContain('English');
    expect(readProfilePath(profile, 'nonsense.path')).toBe('');
  });
});

describe('form filler', () => {
  it('fills approved fields and dispatches input events', () => {
    const doc = documentFrom(FORM_HTML);
    const fields = analyzeForms(doc);
    const plan = buildDeterministicPlan(fields, makeProfile(), { requireConfirmation: false });
    const events: string[] = [];
    doc.addEventListener('input', () => events.push('input'), true);

    const result = fillFields(doc, plan.mappings);
    expect(result.filled).toBeGreaterThan(5);
    expect(events.length).toBeGreaterThan(0);
    expect(doc.querySelector<HTMLInputElement>('#fn')!.value).toBe('Alex');
    expect(doc.querySelector<HTMLInputElement>('#em')!.value).toBe('alex@example.com');
    expect(doc.querySelector<HTMLSelectElement>('#cn')!.value).toBe('pl');
  });

  it('refuses to fill anything that was not approved', () => {
    const doc = documentFrom(FORM_HTML);
    const fields = analyzeForms(doc);
    const plan = buildDeterministicPlan(fields, makeProfile(), { requireConfirmation: true });
    const result = fillFields(doc, plan.mappings);
    expect(result.filled).toBe(0);
    expect(doc.querySelector<HTMLInputElement>('#fn')!.value).toBe('');
  });

  it('leaves demographic selects untouched', () => {
    const doc = documentFrom(FORM_HTML);
    const fields = analyzeForms(doc);
    const plan = buildDeterministicPlan(fields, makeProfile(), { requireConfirmation: false });
    fillFields(doc, plan.mappings);
    expect(doc.querySelector<HTMLSelectElement>('#gender')!.selectedIndex).toBe(0);
  });

  it('never submits the form', () => {
    const doc = documentFrom(FORM_HTML);
    let submitted = false;
    doc.addEventListener('submit', () => {
      submitted = true;
    });
    const fields = analyzeForms(doc);
    const plan = buildDeterministicPlan(fields, makeProfile(), { requireConfirmation: false });
    fillFields(doc, plan.mappings);
    expect(submitted).toBe(false);
  });
});
