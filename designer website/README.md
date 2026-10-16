# AURA Designer Review Website

Updated **16 October 2026**, deployed version **4**. Use **DEV 11** as the backend;
it replaces DEV 05 on the existing authenticated Designer webhook paths.
The pieces endpoint preserves `reviewRevision`, the browser echoes it in its decision,
and the server derives reviewer identity from the signed-in ChatGPT user. Missing or
stale revisions fail validation. Cleanup and purge remain separately disabled.

Server endpoint settings:

```text
N8N_PIECES_URL=https://karimkhalil07.app.n8n.cloud/webhook/designer-review/pieces
N8N_DECISION_URL=https://karimkhalil07.app.n8n.cloud/webhook/designer-review/decision
```

Keep Basic Auth secrets server-side. Private page access and private Drive image
delivery must both pass the live test. See the root README and the whole-project test guide.

This folder contains the complete source for the private designer review dashboard.

The website:

- loads piece folders from `Content/CreatorApproved` through the n8n GET webhook;
- displays the four images inside each piece's `04_PRODUCT_IMAGE_OUTPUTS` folder;
- lets the designer submit a **Good** or **No Good** decision; and
- sends the decision to the n8n POST webhook, which moves the whole piece folder to `DesignerApproved` or `DesignerRejected`.

## Local Setup

Create `.env.local` in this folder with the following variables:

```text
N8N_PIECES_URL=
N8N_DECISION_URL=
N8N_BASIC_USERNAME=
N8N_BASIC_PASSWORD=
```

Do not commit `.env.local` or any credentials.

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

The hosting project configuration is stored in `.openai/hosting.json`. Runtime secrets are configured separately in the hosting environment and are not stored in this repository.
