# OpenAI budget and API keys — 16 October 2026

**Provisional planning allowance:** set aside **$50–$100/month for 10–15 pieces**,
and load **$10–$20 for the first controlled test**. Add credit in small amounts after
measuring a complete piece. This is an engineering allowance, not a quoted price,
measured average, minimum charge or guaranteed monthly cap. Frequent use of all twelve
image attempts or large repeated reference contexts can require **$100–$150 or more**.
The first test's actual Usage/billing is needed to tighten the estimate.

Ten to fifteen pieces means 40–60 final images. Actual paid image attempts range from
40–60 if all four views pass first time to 120–180 at the twelve-attempt ceiling.
Allow for categorization, the consolidated audit, generator/reviewer text-and-vision
tokens, reference images and hosted containers as well as image output.

Official standard rates checked today:

| Meter | Rate |
| --- | --- |
| GPT Image 2.5 Flare or Sunburst — image input | $8 / million tokens |
| GPT Image 2.5 Flare or Sunburst — image output | $30 / million tokens |
| GPT Image 2.5 Flare or Sunburst — text input | $5 / million tokens |
| GPT-5.4-mini — input / output | $0.75 / $4.50 per million tokens |
| Hosted shell / code container, 1 GB | $0.03 per 20-minute session; billing rules apply |

Sources: [pricing](https://developers.openai.com/api/docs/pricing),
[GPT-5.4-mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[image generation costs](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency).
Equal Flare/Sunburst token rates do not guarantee equal cost per image: token use varies.
Direct `/v1/images/edits` calls do not receive the cached-input discount described for
the Responses image-generation tool. Do not apply legacy image-model per-image tables
to the configured 1536×1920 GPT Image 2.5 high-quality requests.

Estimate from billed usage:

```text
image requests = 8 × image_input_tokens/1,000,000
               + 5 × image_text_tokens/1,000,000
               + 30 × image_output_tokens/1,000,000
add GPT-5.4-mini reasoning/vision usage and container/session usage
```

Keep automatic recharge off for initial testing. Alerts alone are not a guaranteed
stop; use a specifically configured hard spend limit where available. Existing paid
switches, attempt limits and journals remain in place. CloudConvert, n8n and hosting
are separate from this OpenAI credit estimate. Extraction and file deletion use zero
OpenAI inference calls.

## Key recommendations from the owner's screenshot

| Key name | Recommendation |
| --- | --- |
| AURA n8n Execution | Keep active; this is the runtime key used by `AURA OpenAI Execution` |
| AURA n8n Setup | Revoke after setup/discovery; it is a temporary read-only discovery key and not used by the current runtime |
| AURA Skills Migration | Already revoked; leave revoked |

The screenshot contains masked values, not a usable secret. That alone is not evidence
the execution key leaked. Rotate any key whose full value was actually exposed in
chat, source or logs: create replacement, update the n8n credential, verify it, then
revoke the old one. Keep execution permissions restricted to the needed endpoints;
never commit actual key values or runtime Basic Auth passwords.

[Official key-management guidance](https://developers.openai.com/api/docs/guides/production-best-practices#api-keys)
recommends secure storage, expiry and rotation. No key was created, changed or revoked
by this repository update. Revocation is an account action, not a workflow import.
