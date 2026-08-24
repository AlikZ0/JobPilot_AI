# AI layer

## Provider abstraction

```ts
interface AIProvider {
  id: AIProviderId;
  label: string;
  chat(request: ChatRequest, credentials: ProviderCredentials): Promise<ChatResponse>;
  analyzeJob(input, ctx): Promise<TaskResult<AIJobFindings>>;
  generateCoverLetter(input, ctx): Promise<TaskResult<CoverLetter>>;
  analyzeForm(input, ctx): Promise<TaskResult<AIFormAnalysis>>;
  generateApplicationAnswer(input, ctx): Promise<TaskResult<ApplicationAnswer>>;
  askAssistant(input, ctx): Promise<TaskResult<AssistantReply>>;
  analyzeResume(input, ctx): Promise<TaskResult<ResumeAnalysis>>;
}
```

`BaseAIProvider` (`src/providers/shared/base.ts`) implements every task in terms of
`chat()`, so adding a provider means writing one HTTP method:

```ts
export class MyProvider extends BaseAIProvider {
  readonly id = 'custom';
  readonly label = 'My Provider';
  readonly defaultBaseUrl = 'https://api.example.com/v1';
  readonly suggestedModels = ['my-model'];

  async chat(request, credentials) {
    const data = await postJson<MyResponse>({/* … */});
    return {
      text: data.output,
      promptTokens: null,
      completionTokens: null,
      model: credentials.model,
    };
  }
}
```

Register it in `src/providers/registry.ts` and add its id to `AI_PROVIDER_IDS`.

## Prompts

Prompts live in `src/core/ai/prompts/` — never inside a component:

| File                   | Task                                 |
| ---------------------- | ------------------------------------ |
| `jobAnalysis.ts`       | structured findings for one posting  |
| `coverLetter.ts`       | cover letter grounded in the profile |
| `formAnalysis.ts`      | classify unknown form fields         |
| `applicationAnswer.ts` | answer one application question      |
| `assistant.ts`         | assistant chat over local data       |
| `resumeAnalysis.ts`    | extract facts from a pasted CV       |

Every prompt includes `TRUTHFULNESS_RULES` and `JSON_RULES` from `shared.ts`, and a
literal schema block. Job-analysis prompts additionally state that the model must
not produce a match percentage.

## Response handling

1. `extractJsonObject()` finds the first balanced `{...}`, tolerating code fences
   and stray prose (brace matching is string-aware).
2. `parseAIJson()` runs `JSON.parse`, then the task's Zod schema.
3. A schema failure raises `AI_INVALID_RESPONSE` with the first few issues and a
   hint. Callers that can degrade (job analysis) fall back to deterministic
   scoring instead of failing.

Model output is never executed, never inserted as HTML and never used to build a
selector.

## Truthfulness

- Cover letters and answers may only use facts from the profile projection.
- Anything the model cannot ground is returned in `unverifiedClaims` /
  `missingInformation` with `status: "needs_user_confirmation"`, and the review
  screen renders it as a warning block.
- In scoring, `mergeSkillFindings()` drops any "matched" skill that is not in the
  profile, so an over-eager model cannot inflate the score.

## Cost control

- Deterministic extraction runs first; the AI only sees a compact JSON job object.
- `maxDescriptionChars` (default 6000) truncates the description before sending.
- Analyses are cached on `(fingerprint, profileVersion, analysisVersion)`.
- `dailyRequestLimit` is enforced before every call.
- Every call — success or failure — is written to the `aiUsage` store with token
  counts and an optional cost estimate from user-supplied per-1K prices.

## Local and cloud modes

**LOCAL** stores your key in `chrome.storage` (persistent or session-only) and calls
the provider directly from the service worker.

**CLOUD** posts to `POST {endpoint}/v1/chat` on a gateway you operate:

```jsonc
// request
{ "model": "…", "messages": [...], "temperature": 0.2, "maxTokens": 2048, "json": true }
// response
{ "text": "{…}", "model": "…", "usage": { "promptTokens": 0, "completionTokens": 0 } }
```

In cloud mode the extension holds no provider key at all.
