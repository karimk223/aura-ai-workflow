# AURA Automated Product Content Pipeline

AURA is an end-to-end product-content workflow for **AURA by Nada**. It receives product photography, organizes every garment in Google Drive, coordinates AI image generation and quality review, routes work through two human approval stages, and reports the state of the entire pipeline in a private operations dashboard.

The system combines n8n orchestration, structured Google Drive folders, scheduled ChatGPT skills, and three purpose-built web applications.

> **Status:** The implementation is complete and ready for final integrated testing. Individual workflow components and dashboard data have been validated; a full production-style run from intake to final designer decision is the remaining acceptance test.

## What the system does

- Captures incoming WeTransfer submissions from trusted email messages.
- Creates a consistent folder structure for each product piece.
- Moves raw assets through preparation and manual-review checkpoints.
- Generates a four-image AURA product set from approved source photography.
- Reviews AI outputs against the real garment references.
- Presents approved sets to the content creator and designer in separate private review sites.
- Moves the complete piece folder according to each reviewer’s decision.
- Shows live counts, piece locations, search results, filters, and Google Drive links in an operations dashboard.

## End-to-end flow

![AURA end-to-end product content workflow](Architecture%20%26%20Design/aura-end-to-end-process-flow.png)

The diagram follows the complete journey from manual raw-footage upload and WeTransfer intake through preparation, AI generation and validation, content-creator review, designer review, final routing, and dashboard reporting. [Open the original full-resolution process flow (PDF)](Architecture%20%26%20Design/NEWEST%20-%20%20Investigative%20AI%20Process%20Flow%20-%20ExampleWorkflow%20.pdf).

## Pipeline stages

| Area | Stage | Meaning |
| --- | --- | --- |
| Raw Footage | `Received` | A new piece has been ingested and organized. |
| Raw Footage | `Processed` | Preparation is complete and the piece is awaiting its AURA readiness decision. |
| Raw Footage | `Approved` | The references are ready for AI generation. |
| Raw Footage | `Rejected` | The submitted references or preparation did not pass manual review. |
| Content | `AIApproved` | The complete four-image set passed automated AI review. |
| Content | `AIRejected` | Rejected candidates and exhausted/failed generation attempts are retained for inspection. |
| Content | `CreatorApproved` | The content creator approved the complete piece. |
| Content | `CreatorRejected` | The content creator rejected the complete piece. |
| Content | `DesignerApproved` | The designer gave final approval. |
| Content | `DesignerRejected` | The designer rejected the complete piece. |

The operations dashboard intentionally reports these ten active stages. The Drive initialization workflow also creates `Generated`, but the current operations dashboard does not include it in its data model.

## Google Drive structure

```text
AURA/
├── RawFootage/
│   ├── Received/
│   ├── Processed/
│   ├── Approved/
│   └── Rejected/
└── Content/
    ├── AIApproved/
    ├── AIRejected/
    ├── CreatorApproved/
    ├── CreatorRejected/
    ├── DesignerApproved/
    └── DesignerRejected/
```

Each product is represented by one piece folder that moves between stages. Intake creates the reference areas used by the generation process:

```text
Piece Name/
├── 01_MATERIAL_CLOSEUPS_4K/
├── 02_WHOLE_FRONT_BACK_SIDE/
├── 03_SIZE_FIT_MODEL_MANNEQUIN/
└── 04_PRODUCT_IMAGE_OUTPUTS/   # Four reviewed product images
```

Moving the folder rather than copying individual images keeps the source evidence, generated outputs, and review state together.

## Repository structure

```text
.
├── AURA Atomated Image Generation n8n Workflow/
│   ├── Initialize Aura Drive Structure.json
│   ├── DEV - 01 WeTransfer Intake.json
│   ├── DEV - 02 Raw Footage Preparation Handoff.json
│   ├── DEV - 03 Manual Review Routing.json
│   ├── DEV - 04 Content Creator Review Dashboard Backend.json
│   ├── DEV - 05 Designer Review Dashboard Backend.json
│   └── DEV - 06 Operations Dashboard Backend.json
├── content creator website/
├── designer website/
├── operations dashboard website/
├── Architecture & Design/
└── README.md
```

> The directory name `AURA Atomated Image Generation n8n Workflow` is preserved to match the existing repository structure.

## n8n workflow catalog

| Workflow | Responsibility |
| --- | --- |
| `Initialize Aura Drive Structure` | Creates the root Raw Footage and Content folder hierarchy. Run once for a new environment. |
| `DEV - 01 WeTransfer Intake` | Finds trusted submissions, resolves and downloads WeTransfer files, creates piece/reference folders, uploads the transfer, and routes permanent failures. |
| `DEV - 02 Raw Footage Preparation Handoff` | Detects `READY_FOR_REVIEW.docx` and moves prepared pieces from `Received` to `Processed`. |
| `DEV - 03 Manual Review Routing` | Detects the approved or rejected marker and moves pieces from `Processed` to `Approved` or `Rejected`. |
| `DEV - 04 Content Creator Review Dashboard Backend` | Lists `AIApproved` pieces and their four product images, validates decisions, and moves the complete folder to `CreatorApproved` or `CreatorRejected`. |
| `DEV - 05 Designer Review Dashboard Backend` | Lists `CreatorApproved` pieces, validates decisions, and moves the complete folder to `DesignerApproved` or `DesignerRejected`. |
| `DEV - 06 Operations Dashboard Backend` | Counts and lists pieces across all ten active stages for the live dashboard. |

The review backends verify that a submitted piece is still in the expected source folder before moving it. This prevents stale pages or repeated clicks from moving an already-reviewed piece again.

## Web applications

### Content creator review

Reads from `Content/AIApproved`, displays the four images in `04_PRODUCT_IMAGE_OUTPUTS`, and provides **Good** and **No Good** actions for the complete piece.

Decision routing:

- **Good** → `Content/CreatorApproved`
- **No Good** → `Content/CreatorRejected`

### Designer review

Reads from `Content/CreatorApproved` and presents the same four-image review experience for the final design decision.

Decision routing:

- **Good** → `Content/DesignerApproved`
- **No Good** → `Content/DesignerRejected`

### Operations dashboard

Provides a bright, responsive view of the complete production pipeline, including:

- live counts for every active Google Drive stage;
- All Pipeline, Raw Footage, and Content toggles;
- volume and distribution charts;
- piece and stage search;
- stage-specific filtering;
- direct links to the corresponding Google Drive folders;
- manual refresh and last-updated state; and
- light and dark display modes.

All three applications are private OpenAI Sites deployments with email-based access controls.

## Application architecture

The browser never calls authenticated n8n endpoints directly:

```text
Browser
  → private OpenAI Site
  → server-side application route
  → Basic Auth-protected n8n production webhook
  → Google Drive
```

This design keeps n8n credentials and Google Drive authorization on the server side. Site access and n8n webhook authentication are separate security layers.

## Local development

Each website is an independent Next.js/Vinext project and can be run separately.

```bash
cd "content creator website"   # or designer website / operations dashboard website
npm ci
cp .env.example .env.local
npm run dev
```

Open the local URL printed by the development server. Before committing a website change, run:

```bash
npm run lint
npm run build
```

### Review-site environment variables

```text
N8N_PIECES_URL=
N8N_DECISION_URL=
N8N_BASIC_USERNAME=
N8N_BASIC_PASSWORD=
```

### Operations-dashboard environment variables

```text
N8N_DASHBOARD_URL=
N8N_BASIC_USERNAME=
N8N_BASIC_PASSWORD=
```

Use n8n **production** webhook URLs for deployed sites. `.env.local` is ignored by Git; production values belong in the hosting environment, not in the repository.

## Installation and deployment

### 1. Prepare Google Drive

Import and run `Initialize Aura Drive Structure.json`, or map the workflows to an existing folder hierarchy. Use exact folder IDs wherever possible because Drive permits duplicate folder names.

### 2. Import the n8n workflows

Import each JSON file into n8n, reconnect the Google Drive and email credentials, and verify every referenced folder ID. Imported credential names are references only; secrets must be configured in the destination n8n instance.

### 3. Configure webhooks

Set the review GET/POST webhooks and the operations statistics webhook to use Basic Auth and production URLs. Publish only the workflows required for the current operating stage.

### 4. Configure the websites

Add the appropriate environment variables to each hosting project. Do not place credentials in client-side variables or source files.

### 5. Configure access

Keep each Site private and add the intended users to its email allowlist. Access changes do not require a new deployment.

## Final acceptance test

The recommended final test uses one non-sensitive sample piece and verifies the complete lifecycle:

1. Submit a trusted WeTransfer email.
2. Confirm the piece and its reference subfolders appear in `RawFootage/Received`.
3. Add `READY_FOR_REVIEW.docx` and confirm the move to `Processed`.
4. Add `READY_FOR_AURA.docx` and confirm the move to `Approved`.
5. Run the scheduled generator and reviewer tasks.
6. Confirm the four images and the resulting `AIApproved` or `AIRejected` route.
7. Submit both content-creator decision paths with test pieces.
8. Submit both designer decision paths with test pieces.
9. Confirm all folder moves, duplicate-click protection, webhook responses, and dashboard counts.
10. Review n8n executions for retries, errors, and unexpected duplicate processing.

## Security and operational notes

- Never commit `.env.local`, passwords, OAuth tokens, or webhook credentials.
- Rotate any credential that has been shared outside its intended secret store.
- Restrict review and dashboard Sites to approved email addresses.
- Keep Google Drive permissions limited to the people and service accounts that need them.
- Prefer Drive folder IDs over folder names in n8n configuration.
- Test with copies or non-sensitive assets before running destructive folder moves in production.
- Workflow JSON exports are configuration backups; the active n8n instance and Google Drive IDs must remain aligned.

## Technology stack

- **n8n** — orchestration, scheduling, validation, webhooks, and routing
- **Google Drive** — source-of-truth asset storage and stage state
- **Scheduled ChatGPT skills** — reference-grounded image generation and independent review
- **Next.js 16 + React 19 + TypeScript** — website application layer
- **Vinext + Cloudflare Workers** — OpenAI Sites build/runtime stack
- **OpenAI Sites** — private hosting and email-based access control
- **Email + WeTransfer** — external asset intake

## Documentation

- Component-specific setup details are available in each website folder’s `README.md`.
- The current architecture reference is stored under `Architecture & Design/`.
- n8n workflow exports in this repository are the portable implementation artifacts for the automation layer.

## Owner

Built and maintained by **Karim Khalil** for **AURA by Nada**.
