# AURA Operations Dashboard

This folder contains the complete source for the private AURA by Nada operations dashboard.

The dashboard provides:

- live piece counts across all current Google Drive workflow stages;
- **All pipeline**, **Raw Footage**, and **Content** views;
- an animated volume chart and stage-distribution chart;
- stage filtering, piece search, and direct Google Drive links;
- Raw Footage cards for `Received`, `Processed`, `Approved`, and `Rejected`;
- Content cards for `AIApproved`, `AIRejected`, `CreatorApproved`, `CreatorRejected`, `DesignerApproved`, and `DesignerRejected`;
- light and dark themes, responsive layouts, and manual data refresh; and
- private Sign in with ChatGPT access.

The dashboard intentionally does not include the retired `Generated` folder.

## Data flow

The website calls its private `/api/dashboard` route. That server route requests the n8n production webhook from `DEV - 06 Operations Dashboard Backend`, then normalizes the response before returning it to the browser. Google Drive and n8n credentials are never exposed to the browser.

## Local setup

Create `.env.local` in this folder:

```text
N8N_DASHBOARD_URL=https://YOUR-N8N-HOST/webhook/aura-dashboard/stats
N8N_BASIC_USERNAME=
N8N_BASIC_PASSWORD=
```

Use the Basic Auth values configured on the n8n webhook. Never commit `.env.local` or credentials.

```bash
npm ci
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```

The OpenAI Sites project configuration is stored in `.openai/hosting.json`. Production environment variables and secrets are managed separately by the hosting platform.
