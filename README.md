# AURA — complete product-content project

Updated **16 October 2026**. n8n coordinates Google Drive, CloudConvert, four versioned
OpenAI skills, and the existing Creator, Designer and Operations websites. The reviewed
imports are inactive drafts. A funded whole-project acceptance test is still pending.

## The eight workflows the whole project needs

Import files are under [AURA Atomated Image Generation n8n Workflow](AURA%20Atomated%20Image%20Generation%20n8n%20Workflow/).

| Workflow | Purpose | Trigger / Beirut time |
| --- | --- | --- |
| DEV 01 — WeTransfer Intake | Download trusted submissions into Received | 09:00 |
| DEV 07 — CloudConvert Frame Extraction | Source ZIP → frames plus unchanged original photos → verified combined ZIP | Called by DEV 10 |
| DEV 10 — AURA Essential Scheduled Skills | Extraction, categorizer, consolidated auditor, generator and independent reviewer | 11:00 / 12:00 / 16:00 / 00:05; explicit manual stage for testing |
| DEV 02 — Raw Footage Preparation Handoff | Genuine READY_FOR_REVIEW marker → Processed | 14:00 |
| DEV 03 — Manual Review Routing | Human readiness decision → Approved/Rejected | 18:30 |
| DEV 04B — Creator Candidate Selection and Image Routing | Creator website: exactly one chosen image per view; archive other candidates | Authenticated website webhooks |
| DEV 11 — Designer Approval and 48-Hour Cleanup | Designer website decisions; separately enabled final cleanup | Authenticated webhooks; cleanup check every six hours |
| DEV 06 — Operations Dashboard Backend | Pipeline stage lists and reporting for the Operations website | Authenticated website webhook |

```text
WeTransfer → DEV01 → Received → DEV10/DEV07 extraction → DEV10 categorizer
 → DEV02 → Processed → DEV10 consolidated auditor → human readiness decision
 → DEV03 → Approved → DEV10 generator + independent reviewer → Creator queue
 → Creator website / DEV04B → CreatorApproved
 → Designer website / DEV11 → DesignerApproved or DesignerRejected
 → separately enabled DEV11 cleanup

Operations website / DEV06 reads the pipeline throughout.
```

DEV 10 invokes the four configured version-1 skills directly. DEV 08/08B are not its
dependencies. DEV 11 replaces DEV 05 on the same Designer webhook paths.

## Obsolete workflows you can remove after backup

These six are outside the current route. Export backups, keep them inactive during
testing, and remove/archive them after the replacement interfaces pass. Removing
them is optional for the test; disable old DEV 04/05 before publishing replacements.

| Exact n8n workflow name | Replacement / reason |
| --- | --- |
| DEV - 04 Content Creator Review Dashboard Backend | DEV 04B four-view selection |
| DEV - 05 Designer Review Dashboard Backend | DEV 11 revision-aware Designer approval |
| DEV - 08 AURA Skill Runner | Unfinished predecessor; DEV 10 replaces it |
| DEV - 08B Audit Source Preparation — BUILD ONLY | Old DEV 08 branch; DEV 10 supplies authenticated sources |
| DEV - 08B Synthetic Empty Evidence Self-Test | Development-only test |
| DEV - 09 Verified ZIP Cleanup After Generation and Review | Superseded early-deletion policy; final cleanup belongs to DEV 11 |

Keep **AURA — Skill Setup** and **Initialize Aura Drive Structure** inactive as
setup/maintenance tools. Neither runs per piece. Do not reinitialize populated Drive
folders or rerun migration. Existing legacy files/history are retained for recovery;
this update does not add obsolete DEV 08/08B imports.

## Required behavior and cost controls

Each selected piece starts with exactly one original ZIP directly in its folder.
DEV 07 extracts frames from **videos only**, includes all original photographs
byte-for-byte, and verifies one `AURA_reference_images_<12hex>.zip` saved in the same
folder. It retains the source ZIP. The three canonical category folders and genuine
human readiness documents gate the consolidated Processed-batch audit and generation.

Images use GPT Image **2.5 Flare** initially and **2.5 Sunburst** for needed precision
repairs: `n=1`, high quality, 1536×1920 opaque PNG. There are at most three actual image
attempts per view and twelve per piece; PASS stops additional attempts for that view.
Every actual candidate is retained for human selection. The reviewer uses actual
same-piece sources and an independent context. AI advice does not replace either human.

Extraction, schedules, Drive moves, dashboards, human approvals and cleanup make
**zero OpenAI inference calls**. CloudConvert uses its existing non-paying-account
and free-credit guard. Locks, journals, readback checks and disabled automatic paid
retries remain necessary to prevent duplicate charges and incorrect moves.

DEV 11 includes final cleanup even while disabled: retain the four exact approved
image IDs, trash recorded non-final descendants of that approved piece, and permit
purge only after **48 real hours from verified Trash**, unchanged approval and explicit
purge enablement. The separate CreatorRejected archive is outside that cleanup.

## Today's acceptance test

Follow [End-to-End Testing](Architecture%20%26%20Design/End-to-End-Testing.md).
The four reviewed imports were reported installed today; the screenshot shows both
mutexes `idle` / `none`. That observation never authorizes clearing a future failed job.

Begin with DEV 10's manual extractor (`enabled:true`, `paidEnabled:false`), then
authorize paid stages after extraction passes. A **whole-project** test also exercises
DEV 01 intake, DEV 02/03 handoffs, both real review websites and DEV 06 reporting.
Starting with an existing ZIP only tests the downstream pipeline. Keep daily schedules
unpublished during manual testing and enable website handlers when their phase begins.
Use cleanup dry-run first; the 48-hour purge hold cannot be bypassed for a same-day test.

Offline tests cover exported graph syntax, native JSON-body routing and table filters,
binary handling, ZIP integrity, candidate/review preservation, actual Creator routing,
stale Designer decisions and cleanup planning. Live service access, image quality,
browser authentication and thumbnail delivery still need the controlled test.

## Current website source

| Website | Source folder | Current interface |
| --- | --- | --- |
| [Creator](https://aura-content-review.karimkhalil631.chatgpt.site) | [content creator website](content%20creator%20website/) | Version 4: up to twelve candidates, exactly four selections, exact-ID/revision submission |
| [Designer](https://aura-designer-review.karimkhalil631.chatgpt.site) | [designer website](designer%20website/) | Version 4: revision preserved/echoed; identity comes from authenticated server context |
| [Operations](https://aura-operations-dashboard.karimkhalil631.chatgpt.site) | [operations dashboard website](operations%20dashboard%20website/) | Existing reporting; summed stage counts may include candidate archive partitions |

See [Deployment Status](Architecture%20%26%20Design/Deployment-Status.md) for version
provenance. GitHub upload does not deploy a Site or activate n8n. Private Site access
and server secrets are configured separately; do not make garment folders public to
fix image loading. DEV 06 totals are not a claim of unique-piece accounting.

## Source, configuration and verification

`creator-selection/` inside the workflow directory holds the current runtime,
materializer, builders and offline tests. Older architecture records are historical;
this README and the test guide supersede their DEV 08/09 and early-deletion instructions.
See [Costs and API Keys](Architecture%20%26%20Design/Costs-and-API-Keys.md) for the
provisional monthly allowance and temporary-key recommendations.

Keep real secrets in n8n credentials and Sites environment settings. Commit only
secret-free `.env.example` files. Use Node **24** for the shared TypeScript contracts:

```sh
cd "AURA Atomated Image Generation n8n Workflow/creator-selection"
node --test essential-runtime.test.mjs import-contract.test.mjs routing-engine.test.mjs selection-core.test.mjs traversal-core.test.mjs final-cleanup-plan.test.mjs
python3 -m unittest test_essential_materializer.py
```

Each website supports `npm ci`, `npx tsc --noEmit --incremental false`, and
`npm run build` from its own folder. These checks require no model calls.
