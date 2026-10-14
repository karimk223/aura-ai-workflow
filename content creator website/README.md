# AURA Content Creator Review Website

This folder contains the complete source for the private content creator review dashboard.

The candidate-selection implementation:

- loads piece folders from `Content/AIApproved` through the n8n GET webhook;
- recursively displays up to three candidates per view (twelve overall) beneath
  `04_PRODUCT_IMAGE_OUTPUTS/_run/candidates`;
- lets the creator select exactly one front, back, three-quarter-front, and detail-collage image;
- submits immutable image IDs and the current queue revision to n8n; and
- accepts success only after n8n has verified all four approved images and the rejected archive.

All attempts are available, including candidates that failed AI review. Root-level final
copies are not duplicate choices. The four selected files become the designer's review
set; other candidates are archived separately. The original references follow the
approved piece. This replaces the old whole-piece **Good / No Good** action.

Status (14 October 2026): the updated website is deployed as version 4 at
[AURA Content Review](https://aura-content-review.karimkhalil631.chatgpt.site).
The new routing workflow is saved in n8n but unpublished. Live queues await backend
activation; no real image moves have been tested.

## Local Setup

Create `.env.local` in this folder with the following variables:

```text
N8N_PIECES_URL=
N8N_SELECTION_URL=
N8N_BASIC_USERNAME=
N8N_BASIC_PASSWORD=
```

Do not commit `.env.local` or any credentials.

Use the new account's production endpoints only when activation is approved:

```text
N8N_PIECES_URL=https://karimkhalil07.app.n8n.cloud/webhook/creator-review/candidates
N8N_SELECTION_URL=https://karimkhalil07.app.n8n.cloud/webhook/creator-review/selection
```

`N8N_SELECTION_URL` intentionally does not fall back to the legacy whole-piece endpoint.
Keep Basic Auth server-side and private visitor access enabled. Do not make the Drive
folders public to resolve an image-loading problem. Offline sample data is available
only through the explicit preview setting in `.env.example`.

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

Offline contract tests (Node 22.13 or newer), from the repository root:

```bash
node --test 'content creator website/tests/'*.test.mjs 'AURA Atomated Image Generation n8n Workflow/creator-selection/'*.test.mjs
```

See [the selection and recovery guide](../Architecture%20%26%20Design/Creator-Candidate-Selection.md)
for the folder contract, routing journal, ZIP-cleanup prerequisites, and cutover checks.

The hosting project configuration is stored in `.openai/hosting.json`. Runtime secrets are configured separately in the hosting environment and are not stored in this repository.
