# Creator selection and verified archive cleanup

This directory contains the source helpers, offline tests, and import-ready exports for
the revised creator flow. Original DEV 01–06 exports remain in the parent directory.
DEV 04B replaces legacy DEV 04 at cutover without overwriting its backup.

| Export | Trigger | Status |
| --- | --- | --- |
| DEV - 04B Creator Candidate Selection and Image Routing.json | Authenticated GET candidates and POST selection webhooks | Saved unpublished; real routing not tested |
| DEV - 09 Verified ZIP Cleanup After Generation and Review.json | Internal Execute Workflow trigger | Saved unpublished; parent completion trigger not connected |

These exports are generated from the latest helpers. The account drafts were imported
during implementation; compare/reimport the latest export before activation, including
final Code-node bundling and retry-budget changes. GitHub does not automatically
synchronize or activate an existing n8n workflow.

## Import checklist

1. Back up existing workflows and keep all imported workflows inactive.
2. Create or map `AURA Routing State` with five string columns: `sourcePieceId`,
   `status`, `owner`, `jobId`, and `jobJson`.
3. Seed exactly one mutex row from `routing-state-seed.csv`:
   `__creator_mutex__`, `idle`, `none`, `none`, `{}`. Do not duplicate it.
4. Map every Data Table node to the actual table. The current account uses
   `0jVQUhHbb9ApVzSH`; another account must use its own ID.
5. Map Drive requests to `Aura Google Drive`. Both creator webhook nodes must use
   `AURA Creator Review`, not the designer credential.
6. Verify exact AIApproved, CreatorApproved, and CreatorRejected folder IDs.
   Never choose identically named folders without checking their parents.
7. Configure the creator Site's server-side `N8N_PIECES_URL` and `N8N_SELECTION_URL`
   to `/webhook/creator-review/candidates` and `/webhook/creator-review/selection`.
   Preserve Basic Auth secrets and private Site access.
8. Leave DEV 09 disconnected until the parent writes a trusted generation completion
   record. Do not run it with invented archive IDs or empty manifests.

No real Drive moves or permanent deletions were performed during implementation.

## Source and tests

- `selection-core.mjs`: candidate indexing, protocol validation, selection plans.
- `traversal-core.mjs`: bounded recursive Drive traversal and pagination.
- `routing-engine.mjs`: durable routing, exact file operations, and recovery.
- `cleanup-engine.mjs`: completion/provenance checks and exact ZIP-file cleanup.
- `code-bundle.mjs`: self-contained n8n Code-node helpers.
- `build-draft.mjs`: shared read/validation graph used by the final builders.
- `build-routing.mjs` / `build-cleanup.mjs`: final inactive workflow builders.
- `*.test.mjs`: contracts, graph/syntax, mocked Drive, retry, and recovery checks.

From the repository root, with Node 22.13 or newer:

```bash
node --test 'AURA Atomated Image Generation n8n Workflow/creator-selection/'*.test.mjs 'content creator website/tests/'*.test.mjs
node 'AURA Atomated Image Generation n8n Workflow/creator-selection/build-routing.mjs' --stats
node 'AURA Atomated Image Generation n8n Workflow/creator-selection/build-cleanup.mjs' --stats
```

Both final builders support `--print` for generated JSON and export `active: false`.
The superseded read-only draft is not the final import.

## Recovery and cleanup safety

A conditional mutex serializes writes; a durable journal records reserved destination
IDs and completed operations. Repeated identical selections resume the stored job.
Stale revisions or different selections cannot overwrite it. The original piece moves
to CreatorApproved last, after all selected/rejected destinations are verified.

After a hard interruption, confirm the recorded owner execution has stopped. Inspect
the journal and Drive IDs before manually releasing only the mutex. Never steal a
running lock or erase progress to bypass an incomplete operation.

Cleanup requires generator and reviewer completion, retained reference/candidate
verification, and exactly two trusted ZIP-file records: `original_transfer_zip` and
`extracted_frames_zip`. It permanently deletes those exact IDs and confirms their
absence. It never broadly searches for ZIPs or deletes references, videos, or images.

See the [selection and recovery guide](../../Architecture%20%26%20Design/Creator-Candidate-Selection.md)
for the detailed API schemas, completion manifest, and cutover checks.
