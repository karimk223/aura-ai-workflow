# AURA creator candidate selection

Status: implemented with 27 passing offline tests, 14 October 2026. The updated
creator website is deployed as version 4. New routing and ZIP-cleanup drafts are saved
in the new n8n project and remain unpublished; no real Drive writes or deletions were run.

## Confirmed piece layout

```text
Piece/
├── 01_MATERIAL_CLOSEUPS_4K/
├── 02_WHOLE_FRONT_BACK_SIDE/
├── 03_SIZE_FIT_MODEL_MANNEQUIN/
└── 04_PRODUCT_IMAGE_OUTPUTS/
    └── _run/
        └── candidates/
            ├── front/                 # at most 3 images
            ├── back/                  # at most 3 images
            ├── three_quarter_front/   # at most 3 images
            └── detail_collage/        # at most 3 images
```

Read image descendants recursively within each view tree, using actual Drive parent IDs,
not a global filename search. The gallery contains a maximum of twelve distinct images.
Root-level final copies and report assets are not extra gallery options. Existing final
copies should be preserved below `_run/final_copies` when creating the designer-facing
root; do not delete them. No such live move has been performed.

All attempts, including failed AI reviews, remain selectable. AI labels are informational;
do not infer a PASS label merely from an attempt number or an `AIApproved` stage name.
`Content/AIApproved` now means awaiting creator selection. Do not generate new AIRejected
routes or delete its old archives.

## Creator and designer handoff

The creator chooses exactly one image from each view. Four selected candidates become
the designer-facing images under `CreatorApproved/Piece/04_PRODUCT_IMAGE_OUTPUTS`:

| View | Canonical filename stem |
| --- | --- |
| front | `01_front` |
| back | `02_back` |
| three_quarter_front | `03_three-quarter-front` |
| detail_collage | `04_material-craftsmanship-collage` |

Preserve the actual PNG/JPEG/WebP encoding and extension; renaming is not conversion.
The designer's existing direct-child, four-image reader remains compatible with this
layout. The retained reference folders follow the approved piece, not its rejected
asset archive. Unselected candidates retain their view/attempt ancestry under the
corresponding `CreatorRejected/Piece/04_PRODUCT_IMAGE_OUTPUTS/_run/candidates` tree.
Never copy the references into the rejected partition unnecessarily.

Use the original immutable source piece ID (`auraSourcePieceId`) in manifests for both
partitions. Identically named garments must not be merged. A rejection partition is
not a second garment and does not mean the whole piece was rejected.

## API contract

Keep Basic Auth between the website server and n8n, and existing private Sites visitor
access. Secrets stay in runtime/n8n credential stores, not the browser or repository.

GET queue response:

```json
{
  "protocol": "aura-creator-selection/v1",
  "pieces": [{
    "pieceFolderId": "immutable-drive-piece-id",
    "pieceName": "Dress",
    "reviewRevision": "hash-of-current-trusted-candidate-pool",
    "issues": [],
    "images": [{
      "id": "immutable-drive-image-id",
      "name": "attempt_1.png",
      "url": "https://drive.google.com/thumbnail?id=immutable-drive-image-id&sz=w1600",
      "view": "front",
      "attempt": 1,
      "path": "04_PRODUCT_IMAGE_OUTPUTS/_run/candidates/front/attempt_1.png",
      "aiReview": "not_available"
    }]
  }]
}
```

The example shows one record for brevity; every piece needs a candidate in all four
views before submission. `attempt` is 1–3; `aiReview` is `pass`, `fail`, or
`not_available`. Prefer explicit generation metadata (`auraAttempt`, `auraAIReview`)
or a verified manifest. If attempt metadata is absent, the offline indexer assigns
stable display order by path/ID; it does not pretend that order proves generation order.
The n8n collector must paginate all folder/file results and request parents, MIME type,
modified time, checksums, and app properties. Do not truncate at twelve silently.

POST `creator-review/selection`:

```json
{
  "protocol": "aura-creator-selection/v1",
  "pieceFolderId": "immutable-drive-piece-id",
  "reviewRevision": "hash-of-current-trusted-candidate-pool",
  "selections": {
    "front": "front-image-id",
    "back": "back-image-id",
    "three_quarter_front": "three-quarter-image-id",
    "detail_collage": "detail-image-id"
  }
}
```

Re-enumerate the trusted pool server-side. Confirm the piece is still in AIApproved,
the revision matches, the four IDs are distinct and belong to the requested piece/view,
and there are no completion or structural warnings. Derive the rejected IDs on the
server, never from a browser-provided list. Stale selection returns HTTP 409.

Return `{"protocol":"aura-creator-selection/v1","success":true,"committed":true}`
only after the actual destinations have been verified. The website does not accept
the old `good`/`no_good` response as a successful selection. It uses the separate
`N8N_SELECTION_URL` setting and never falls back to `N8N_DECISION_URL`.

## Implemented routing draft

The import-ready replacement is `DEV - 04B Creator Candidate Selection and Image Routing.json`
inside `AURA Atomated Image Generation n8n Workflow/creator-selection`.
It is saved in the new n8n account as workflow `hxCyYxr5to7S1Glv`. The original DEV 04
workflow/export is preserved. Both new creator endpoints use the existing
`AURA Creator Review` credential; Drive requests use `Aura Google Drive`.

Routing uses a conditional database mutex and durable progress records in the
`AURA Routing State` data table (`0jVQUhHbb9ApVzSH`). The custom string columns are
`sourcePieceId`, `status`, `owner`, `jobId`, and `jobJson`. A single seed row has
`sourcePieceId=__creator_mutex__`, `status=idle`, `owner=none`, `jobId=none`, and `jobJson={}`.
The same lock protects creator routing and ZIP cleanup. Do not duplicate the mutex row.

The workflow reserves destination IDs and checkpoints them before creation, records
each file operation, checks exact resulting parents/names/checksums, and resumes the
same selection after partial failure. Different selections cannot replace a saved job.
Four approved root files and all rejected destinations are verified before commit;
the original piece moves out of AIApproved last. Drive moves across multiple files are
not atomic, so the workflow does not report success for a partial result.

The exports and compiled Code-node helpers are covered by offline graph, syntax, and
mock-Drive recovery tests. This is not evidence of a successful real n8n execution.
The account drafts were imported during implementation. Compare or reimport the latest
repository exports before activation, including final bundling and retry-budget changes.

### Recovery and activation

A hard interruption deliberately leaves the mutex held. First confirm the recorded
owner execution has terminated; inspect the saved journal and exact Drive IDs before
manually resetting only that mutex row to `idle` / `none`. Never steal a running lock
or remove progress records to retry. Retry the original selection to resume it.

Before approved activation, verify the current table and credential selections,
deploy the matching website source with the new endpoints, and test using a disposable
piece. Include stale selections, interrupted moves, duplicate submits, and designer
compatibility. Do not publish or start real routing as part of setup.

Confirm private-image delivery works for the allowed reviewer; do not make a Drive
folder public merely to make thumbnail links work. Review any generation output root
copies before applying their proposed preservation move.

## ZIP cleanup checkpoint

`DEV - 09 Verified ZIP Cleanup After Generation and Review.json` is an internal
subworkflow, not a public webhook. It is saved as `f1Gg35SKj3OTiC43`, unpublished and
not yet called by a parent generation workflow. It requires a trusted completion
record and refuses missing, incomplete, ambiguous, or changed inputs.

Only after extraction and four-view generation/review complete:

1. Require durably recorded generator and reviewer completion; verify retained images
   exist within all three reference roots and all four candidate-view trees.
2. Resolve original WeTransfer ZIP and extracted-frame ZIP IDs from their trusted
   intake/extraction manifests, including checksums and retained extracted-asset IDs.
3. Verify each exact target is the expected ZIP container for this piece, not a folder
   containing references or a different transfer. No broad extension-based deletion.
4. Perform separately authorized, logged permanent deletion with action-time confirmation
   when operated through the browser. Failed verification leaves archives intact.

The child accepts `{pieceFolderId, runId}` from n8n, then reads a completed table row
whose `sourcePieceId` is `generation:<pieceFolderId>:<runId>`, `status` is `completed`,
and `jobId` is the run ID. Its `jobJson` contains:

```json
{
  "sourcePieceId": "piece-id",
  "runId": "run-id",
  "pipelineStatus": "completed",
  "generatorStatus": "completed",
  "reviewerStatus": "completed",
  "extractionVerified": true,
  "intakeArchives": [],
  "referenceAssets": []
}
```

The empty arrays above illustrate the schema only and are rejected at runtime.
`intakeArchives` must contain exactly two distinct ZIP-file IDs, one role
`original_transfer_zip` and one `extracted_frames_zip`. Each records `id`, `name`,
`mimeType`, `parentId`, `md5Checksum`, `sourcePieceId`, `extractionVerified`,
`consumerPieceIds`, `completedConsumerIds`, and `ancestorChain`.
References record `id`, `name`, image `mimeType`, `parentId`, `md5Checksum`, and
`ancestorChain`. Chains enumerate folders from the immediate parent upward, stopping
before the piece; each folder has `id`, `name`, and `parentId`. A direct-child ZIP uses
an empty chain. Shared archives cannot be deleted until every consumer has finished.

The parent must obtain archive provenance from its own intake/extraction records, not
from AI-chosen deletion targets. Both archives are preflight-verified before either
is deleted, and retained images are verified again afterward. Progress is stored under
`cleanup:<pieceFolderId>:<runId>` so a retry checks the same IDs. Permanent deletion
uses the Drive API, not Trash. No archives, images, references, or stage folders have
been deleted during implementation. The parent connection awaits the teammate's
generation completion contract.

## Dashboard follow-up

Keep legacy AIRejected history distinguishable from active stages. CreatorApproved and
CreatorRejected may now both contain assets for the same source piece. Count unique
piece IDs for total garments and asset partitions separately; summing folder counts
would double-count those pieces. Update labels and statistics in a separate dashboard
change before final end-to-end testing.
