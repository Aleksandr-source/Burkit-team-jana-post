# Product paraphrase regression

54 questions: for each of RU, KK and EN, 10 supported workflows and 8 unsupported/private/role-restricted requests. The fixture checks original source IDs, required source facts, refusal and citation integrity through the real HTTP application. These are fictional application policies, not official Jana Post rules.

The questions were written before changing `knowledge-support.mjs`. The first run (`../runs/2026-10-18-challenge-before/`) returned refusal for all 30 supported questions. After that observation this set was used to improve the vocabulary. It is now **development/regression data, not an independent holdout**. Two passes repeat the same 54 questions; 108 calls are not 108 unique questions. Stub-provider unit tests only check coverage, access and rendering, not neural quality.

One fixture erratum after the first run: `en-submit` required “dates”, but the original English source says “first and last day”. Only the required fact changed; the question and expected source did not. Each run freezes its input and records its SHA-256, so the difference remains visible.

Install the pinned local model with `npm run ai:setup`, then run (use a new output directory each time):

```sh
node scripts/check-demo-ai.mjs evaluation/runs/my-product-run evaluation/product-challenge/cases.json
```

This opt-in command starts a real CPU model, creates isolated accounts/storage, performs two passes without artificial warm-up, opens the cited sources, checks all source languages/roles, then checks offline and controlled-timeout fallback. The latter two are separate resilience probes, not model inference results. It exits nonzero for any incorrect expected answer, invalid citation/access, or response over 10 seconds. Reports include model verification, machine configuration, latency by language, fixture and product source hashes. The native process and temporary account database are cleaned up.

No automatic hackathon score is derived from these results. A separate unseen human-authored question set and a native Kazakh review are still needed for an independent accuracy claim.
