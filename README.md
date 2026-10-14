# AURA Automated Product Content Pipeline

A private product-content pipeline for **AURA by Nada**. It receives garment references,
organizes assets in Google Drive, coordinates image generation and quality review,
supports two human review stages, and reports the production pipeline.

n8n orchestrates the workflow, Google Drive holds the assets, and three private websites
serve the creator, designer, and operations team. Website source stays in its respective
folder; the established repository structure is preserved.

## Current status — 14 October 2026

All three websites are deployed. The updated creator Site is **version 4**.
The n8n workflows remain **unpublished during migration**, as requested.

| Component | Status |
| --- | --- |
| Creator candidate-selection website | Deployed; up to twelve candidates, exactly one selection per view |
| Designer website and operations dashboard | Deployed; existing functionality retained |
| DEV 04B — Creator image routing | Implemented and saved as an unpublished n8n draft |
| DEV 09 — Verified ZIP cleanup | Implemented and saved unpublished; parent completion trigger not connected |
| Automatic video extraction and reference classification | Planned; not connected |
| OpenAI API generation, review, and audit | Awaiting the teammate's migrated skills and invocation/completion contract |
| Final end-to-end acceptance test | Pending explicit approval |

Offline checks cover contracts, graph/syntax validation, and simulated routing/recovery.
They do not prove that a real Drive move, deletion, or complete production run succeeded.
A published page can be available while its queue is unavailable because n8n is off.

## End-to-end flow

![AURA end-to-end product content workflow](Architecture%20%26%20Design/aura-end-to-end-process-flow.png)

This original diagram remains the architectural baseline. The latest revision adds
automated frame preparation, n8n-triggered API jobs, four-view candidate selection,
and verified archive cleanup. See the
[migration plan](Architecture%20%26%20Design/API-Automation-Migration.md)
for the revised integration design.

1. **Intake:** a trusted WeTransfer submission creates a piece in `RawFootage/Received`.
2. **Preparation:** extract frames, classify references, and verify evidence coverage.
   Only then create `READY_FOR_REVIEW.docx` and move the piece to `Processed`.
3. **Readiness decision:** `READY_FOR_AURA.docx` routes the piece to `Approved`;
   the existing rejection marker routes unsuitable references to `Rejected`.
4. **Generation:** n8n invokes the teammate's API-configured generator, reviewer, and
   auditor. Preserve up to three attempts for each of four product views.
5. **Completion and cleanup:** verify the finished images and retained references before
   deleting the two specifically recorded ZIP containers. The skills place the candidate
   pool in `Content/AIApproved`; n8n must not repeat that move independently.
6. **Creator selection:** choose exactly one image per view from all candidates.
   The four selections go to `CreatorApproved`; unselected candidates go to a separate
   `CreatorRejected` archive for the same source piece.
7. **Designer decision:** review the four selected images and route the complete approved
   piece to `DesignerApproved` or `DesignerRejected`.
8. **Operations:** report stage locations, distinguishing unique garments from rejected
   image partitions.

## Drive structure and stage meanings

```text
AURA/
├── RawFootage/
│   ├── Received/
│   ├── Processed/
│   ├── Approved/
│   └── Rejected/
└── Content/
    ├── Generated/           # Existing folder, outside the current dashboard model
    ├── AIApproved/          # Queue for creator selection
    ├── AIRejected/          # Historical archive; no new candidate routing here
    ├── CreatorApproved/     # Four selected images and the original references
    ├── CreatorRejected/     # Unselected candidate partition for the same piece
    ├── DesignerApproved/
    └── DesignerRejected/
```

The prepared piece retains its references and complete candidate tree:

```text
Piece/
├── 01_MATERIAL_CLOSEUPS_4K/
├── 02_WHOLE_FRONT_BACK_SIDE/
├── 03_SIZE_FIT_MODEL_MANNEQUIN/
└── 04_PRODUCT_IMAGE_OUTPUTS/
    └── _run/
        └── candidates/
            ├── front/                 # Maximum 3 images
            ├── back/                  # Maximum 3 images
            ├── three_quarter_front/   # Maximum 3 images
            └── detail_collage/        # Maximum 3 images
```

All twelve possible candidates are available, including AI-failed attempts.
`AIApproved` is a queue name, not proof that every candidate passed AI review.
Root-level final copies are not duplicate gallery choices.

Selected images become four direct children of the approved piece's
`04_PRODUCT_IMAGE_OUTPUTS`; original references follow that piece. Unselected images
retain their view ancestry under the corresponding rejected archive. Both partitions
retain the immutable source piece identity; matching names alone are insufficient.

The existing operations dashboard still reports ten stage keys, including historical
`AIRejected`. Its statistics need a follow-up adjustment for the new partition meaning:
summing approved and rejected folder counts would double-count some garments. Current
dashboard totals must not be presented as unique-piece accounting after cutover.

## Repository structure

```text
.
├── AURA Atomated Image Generation n8n Workflow/
│   ├── Initialize Aura Drive Structure.json
│   ├── DEV - 01 WeTransfer Intake.json
│   ├── DEV - 02 Raw Footage Preparation Handoff.json
│   ├── DEV - 03 Manual Review Routing.json
│   ├── DEV - 04 Content Creator Review Dashboard Backend.json  # Legacy
│   ├── DEV - 05 Designer Review Dashboard Backend.json
│   ├── DEV - 06 Operations Dashboard Backend.json
│   └── creator-selection/
│       ├── DEV - 04B Creator Candidate Selection and Image Routing.json
│       ├── DEV - 09 Verified ZIP Cleanup After Generation and Review.json
│       ├── routing-state-seed.csv
│       ├── *.mjs           # Builders, routing helpers, and offline tests
│       └── README.md
├── content creator website/
├── designer website/
├── operations dashboard website/
├── Architecture & Design/
└── README.md
```

The existing spelling of `AURA Atomated Image Generation n8n Workflow` is preserved.
DEV 04B replaces the creator flow at cutover without overwriting the legacy DEV 04 backup.

## Workflow catalog

| Workflow | Responsibility |
| --- | --- |
| Initialize Aura Drive Structure | Creates the initial hierarchy; do not rerun blindly in an existing environment |
| DEV 01 — WeTransfer Intake | Receives trusted submissions and stores the original assets |
| DEV 02 — Raw Footage Preparation Handoff | Detects `READY_FOR_REVIEW.docx` and moves prepared pieces to `Processed` |
| DEV 03 — Manual Review Routing | Routes preparation approval/rejection to the appropriate raw stage |
| DEV 04 — Creator Review (legacy) | Previous whole-piece Good / No Good backend; retained as a backup |
| DEV 04B — Candidate Selection and Image Routing | Lists candidates, validates four selections, journals moves, and verifies destinations |
| DEV 05 — Designer Review | Reviews the selected set and routes the final piece decision |
| DEV 06 — Operations Dashboard | Lists pieces and counts across the existing stage model |
| DEV 09 — Verified ZIP Cleanup | Internal completion-gated subworkflow; deletes exactly two verified ZIP-file IDs |

DEV 04B and DEV 09 share a conditional mutex and durable progress records in
`AURA Routing State`. Identical submissions resume the same selection; stale or different
selections cannot replace it. A hard interruption keeps the lock held for deliberate
recovery. See the
[selection and recovery guide](Architecture%20%26%20Design/Creator-Candidate-Selection.md)
and [workflow import guide](AURA%20Atomated%20Image%20Generation%20n8n%20Workflow/creator-selection/README.md).

## Private websites

| Website | Purpose |
| --- | --- |
| [Content creator](https://aura-content-review.karimkhalil631.chatgpt.site) | Compare candidates and submit exactly four selections |
| [Designer](https://aura-designer-review.karimkhalil631.chatgpt.site) | Approve or reject the selected four-image set |
| [Operations dashboard](https://aura-operations-dashboard.karimkhalil631.chatgpt.site) | Search, filter, and inspect the pipeline |

Site publication and n8n activation are separate. The browser calls server routes,
not authenticated n8n directly:

```text
Allowed visitor → private Site → server-side API route → authenticated n8n → Google Drive
```

Credentials stay server-side. Private Site access does not automatically grant access to
private Drive thumbnails; verify image delivery without making garment folders public.

## Development and configuration

Each website is an independent Next.js/Vinext application:

```bash
cd "content creator website"  # Or one of the other website folders
npm ci
cp .env.example .env.local
npm run dev
```

Configure the appropriate **server-side** runtime settings:

| Application | Endpoint settings | Secret settings |
| --- | --- | --- |
| Creator | `N8N_PIECES_URL`, `N8N_SELECTION_URL` | `N8N_BASIC_USERNAME`, `N8N_BASIC_PASSWORD` |
| Designer | `N8N_PIECES_URL`, `N8N_DECISION_URL` | `N8N_BASIC_USERNAME`, `N8N_BASIC_PASSWORD` |
| Operations | `N8N_DASHBOARD_URL` | `N8N_BASIC_USERNAME`, `N8N_BASIC_PASSWORD` |

Creator endpoints are `/webhook/creator-review/candidates` and
`/webhook/creator-review/selection` on the new n8n host. There is no fallback to the old
whole-piece `/decision` handler. Deployed sites use production webhook URLs, never the
one-shot `/webhook-test/` URLs. Runtime secrets are separate from source.

Offline checks, from the repository root (Node 22.13 or newer):

```bash
node --test 'content creator website/tests/'*.test.mjs 'AURA Atomated Image Generation n8n Workflow/creator-selection/'*.test.mjs
```

Type-check and build the changed website before publication:

```bash
cd "content creator website"
npx tsc --noEmit --incremental false
npm run build
```

## Activation and acceptance

Keep n8n unpublished until the owner approves testing. Map exact Drive IDs, reconnect
credentials, verify the routing table and seed row, and compare the latest exported
Code nodes with the account drafts before activation. Do not recreate populated folders
to resolve duplicate dropdown names.

The final acceptance run should use disposable, non-sensitive assets and cover:

- intake, extraction, classification, evidence coverage, and readiness markers;
- API completion and all retained reference/candidate files;
- cleanup refusing incomplete, changed, or shared archives before deleting only the
  two verified ZIPs after successful generation and review;
- one creator choice per view, stale/duplicate submits, and partial-move recovery;
- both designer decisions with the actual selected set;
- allowed-user sign-in, private image delivery, and denied-user access; and
- correct unique-piece versus partition statistics in the dashboard.

## Security and operations

- Never commit API keys, passwords, `.env.local`, OAuth tokens, or source-upload tokens.
- Restrict private websites to their intended visitors.
- Use immutable Drive IDs, checksums, bounded retries, and durable job records.
- Permanently delete only verified ZIP **files** from trusted provenance. Preserve raw
  videos, extracted references, and stage folders.
- Do not steal a running lock or erase journals to force a retry.
- Exports are backups, not proof of an active deployment; verify credentials, table
  IDs, settings, and code versions before any production run.
- The teammate owns API skill setup. An API key alone does not give skills Drive access.

## Documentation

- [Creator selection, folder contract, API schema, and recovery](Architecture%20%26%20Design/Creator-Candidate-Selection.md)
- [API migration and remaining integration work](Architecture%20%26%20Design/API-Automation-Migration.md)
- [DEV 04B / DEV 09 import and verification](AURA%20Atomated%20Image%20Generation%20n8n%20Workflow/creator-selection/README.md)
- Component setup details in each website's `README.md`

Built and maintained by **Karim Khalil** for **AURA by Nada**.
