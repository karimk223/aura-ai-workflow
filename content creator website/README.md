# AURA Content Creator Review Website

This folder contains the complete source for the private content creator review dashboard.

The website:

- loads piece folders from `Content/AIApproved` through the n8n GET webhook;
- displays the four images inside each piece's `04_PRODUCT_IMAGE_OUTPUTS` folder;
- lets the content creator submit a **Good** or **No Good** decision; and
- sends the decision to the n8n POST webhook, which moves the whole piece folder to `CreatorApproved` or `CreatorRejected`.

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
