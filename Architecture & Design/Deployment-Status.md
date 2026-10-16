# Website deployment status

## Current source set — 16 October 2026

Sites version history confirms Creator **version 4**, source
`f2707b9506867ea4c8ae63c04bacf7e3f566f3d6`, and Designer **version 4**, source
`85cc13c3a3fba9310f60bcc427418b69b68af2f9`, as their newest saved versions.
The Creator source already in this repository contains the current four-view selector;
it is retained. The Designer's three revision/identity patch files were compared
byte-for-byte with the existing version-4 publishing checkout and match.
This GitHub update changes source/docs only; it does not redeploy either website.

## Designer patch — 16 October 2026

Designer version 4 deployed successfully at
https://aura-designer-review.karimkhalil631.chatgpt.site.

- Source commit: `85cc13c3a3fba9310f60bcc427418b69b68af2f9`
- Saved version: `appgprj_6aa11fb161b08191804e0e3d6c7c5367~appgver_b4fe6117fc0c819190677190d9d72baf`
- Deployment: `appgdep_6ad17ab7fd3c8191896d4340fad7bdf4` — `succeeded`
- Runtime environment revision: `3` (unchanged)
- Existing custom visitor access, sign-in, URLs and secrets preserved.

The image-list endpoint preserves `reviewRevision`; the browser submits it with each
decision, and the server derives reviewer identity from authenticated context.
TypeScript, production build, and mocked revision/authentication regression checks
passed. Browser QA and live n8n approval tests were not performed. DEV 11 must supply
the matching revision-aware backend before live approvals. No n8n workflows were
activated, and no paid API calls, cleanup, or Drive changes were made by this deployment.

## Earlier deployment record

Verified 14 October 2026. These are the existing private OpenAI Sites, not replacement
sites or alternate hosting. Deployment is separate from backend activation.

| Site | Published version | URL |
| --- | --- | --- |
| Content creator | 4 — updated candidate-selection interface | https://aura-content-review.karimkhalil631.chatgpt.site |
| Designer | 3 — existing four-image decision interface | https://aura-designer-review.karimkhalil631.chatgpt.site |
| Operations | 2 — existing stage dashboard | https://aura-operations-dashboard.karimkhalil631.chatgpt.site |

The creator deployment completed with status `succeeded`:

- Source commit: `f2707b9506867ea4c8ae63c04bacf7e3f566f3d6`
- Saved version: `appgprj_6aa01ecb651481919dae82d0f131523a~appgver_20ac9d49ef8481918851f31db348c228`
- Deployment: `appgdep_6acfa51ba1cc819194c1e03705a591bb`
- Runtime revision: `4`

Custom visitor access and existing Basic Auth secrets were preserved. The creator's
server-side endpoints now use the new account's `/webhook/creator-review/candidates`
and `/webhook/creator-review/selection` handlers. Production sample data is disabled.
Secrets remain in the hosting environment, not this repository.

The designer and dashboard retain their deployed source and use the new n8n account's
`/webhook/designer-review/pieces`, `/webhook/designer-review/decision`, and
`/webhook/aura-dashboard/stats` endpoints respectively.

All n8n workflows remain unpublished by request. Therefore a published page can display
an unavailable-queue message until the owner approves backend activation. Real image
routing, reviewer image delivery, and end-to-end testing remain pending. Source tests,
TypeScript, and production build passed; this deployment did not include browser QA.

The latest DEV 04B / DEV 09 repository exports must be compared with the saved account
drafts before activation. Video extraction and the teammate's OpenAI skills integration
have not been connected, and no real Drive files were moved or deleted.
