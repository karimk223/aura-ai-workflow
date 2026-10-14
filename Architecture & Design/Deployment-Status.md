# Website deployment status

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
