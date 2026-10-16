# Whole-project acceptance test — 16 October 2026

Required workflows: **DEV 01, 02, 03, 04B, 06, 07, 10 and 11**. DEV 07 is DEV 10's
child, not a second manual pipeline. The Creator, Designer and Operations websites
are all in scope. Keep the six obsolete workflows listed in the root README inactive.

## Imports and account state

The four reviewed DEV 07/10/11/04B files are the same files provided in the reviewed
test package. The owner reported replacing their nodes in the existing workflows.
Both routing mutexes were shown idle/none at 13:11 Beirut on 16 October. This records
setup state, not permission to clear a later execution's lock.

For future imports: download a backup first. In this n8n editor **Import from File
adds nodes to the canvas**. To replace an entire graph, clear its nodes first, import
once, and save within the existing workflow. Preserve workflow IDs and credentials;
do not delete the workflow itself. An import does not activate production schedules.

DEV 10's `Call Existing CloudConvert Extractor` targets existing DEV 07 ID
`D8QQZzhw903FrcuO`, waits for completion, and passes `sourceFileIds` as an array.
The routing table is `0jVQUhHbb9ApVzSH` with string columns `sourcePieceId`, `status`,
`owner`, `jobId`, `jobJson` plus native id/timestamps. The two mutex rows already exist;
do not duplicate seed rows or rebuild 34 conditions manually.

Credentials remain in n8n: `Aura Google Drive`, `CloudConvert – AURA`,
`AURA OpenAI Execution`, `AURA Creator Review`, `AURA Designer Review Login`.
Creator and Designer use their own Basic Auth credentials. Source JSON stores references,
not secret values. Both review websites use production `/webhook/` URLs, not one-shot
`/webhook-test/` URLs. Publishing the matching authenticated backend is necessary to test them.

## Test order

1. **Intake / DEV 01.** Submit one trusted test transfer and run one intake cycle.
   Confirm one piece and its original ZIP under Received. If using the existing test
   piece `1uQnNhz3hGTTByNHNekaeH-AYpqWOAxp6`, record intake as **not retested**; that only
   exercises the downstream pipeline. Do not redownload or generate duplicates blindly.
2. **Extraction / DEV 10 → DEV 07.** Keep DEV 10 unpublished. Set `enabled:true`,
   `paidEnabled:false`, stage `extractor`, and the one selected piece ID in
   `Choose Manual Test Piece`. Run **Manual One-Piece Test** once. Expected: exactly
   one source ZIP, video-only ffmpeg extraction, all original photographs unchanged,
   one combined ZIP in the same folder, source ZIP retained, and parent completion.
   The child returns `originalImagesByteIdentical:true`, `savedZipReadbackVerified:true`,
   and `verifiedFileCount = frameCount + originalImageCount`. No OpenAI calls occur.
3. **Categorization / DEV 10.** After extraction passes, authorize the paid stage,
   set `paidEnabled:true` and stage `categorizer`. Confirm the combined ZIP's readable
   distinct photographs/frames reach the configured skill and the category folders,
   with a genuine `READY_FOR_REVIEW.docx` created only on completion.
4. **Preparation / DEV 02.** Trigger one handoff cycle rather than waiting for the
   daily clock. Verify the completed piece moves Received → Processed and keeps its assets.
5. **Consolidated audit / DEV 10.** Set stage `auditor`; it intentionally omits the
   manual piece ID and audits **all eligible Processed pieces**. Inspect that batch scope
   before the funded run. Confirm one canonical `audit__AURA_by_Nada.docx` in the Aura
   root and evidence receipts tied to the actual source revisions.
6. **Human readiness / DEV 03.** Complete the genuine human preparation approval
   (`READY_FOR_AURA.docx`) and trigger one routing cycle. Confirm Processed → Approved.
   Do not substitute a fake marker to force a failed audit through the test.
7. **Generation and reviewer / DEV 10.** Stage `generator`, same selected piece.
   Verify four sequential views, actual source-image delivery, independent review,
   every actual candidate retained, and Creator queue placement. Flare is the initial
   model; Sunburst is for needed precision repairs. PASS stops additional attempts;
   all edits/model switches count toward three per view / twelve per piece.
8. **Creator website / DEV 04B.** Publish its authenticated handler at the website
   phase. Select one image per view and submit. Verify the exact four IDs/filenames in
   `04_PRODUCT_IMAGE_OUTPUTS`, rejected-candidate archive and original references.
   The original piece moves to CreatorApproved last. Test via the real website.
9. **Designer website / DEV 11.** Set only `enabled:true`; keep `cleanupEnabled:false`,
   `purgeEnabled:false`. DEV 05 must be inactive before publishing DEV 11's same paths.
   Sign in, confirm four real images load, and submit a decision. The current revision
   and server-derived reviewer identity must be accepted; a stale set must be rejected.
   Confirm the selected piece moves to DesignerApproved or DesignerRejected.
10. **Operations website / DEV 06.** Activate its authenticated read handler for the
    test; verify the piece's location/links match Drive. Historical AIRejected and the
    separate CreatorRejected partition can make summed counts differ from unique garments.
11. **Final cleanup / DEV 11.** Inspect the dry-run retain/trash IDs on a disposable
    approved piece first. Actual cleanup is a separately authorized phase: retain the
    four exact approved IDs and trash recorded non-final descendants of that piece.
    No OpenAI call is involved. Permanent purge needs its own switch and **48 real
    hours from verified Trash**. Today's test cannot claim a real 48-hour purge pass.

After manual testing, set `paidEnabled:false` until scheduled operation is deliberately
activated. Keep cleanup/purge off until that separate phase. Activate daily schedules
only after the corresponding tests pass. Schedules use **Asia/Beirut**, not a fixed UTC offset.

## On a failed run

Record the execution ID, failing node and returned error. A failed or uncertain paid
submission may have consumed credits even without a successful response. Use its
recorded job/request IDs to reconcile; do not repeatedly Execute or erase the journal.
The old execution 45 failed before submission and was resolved during setup; that is
not a rule for clearing any future owner. These existing controls protect cost and file integrity.

## Source status and offline checks

DEV 07/10 came from the owner's attached exports. DEV 11/04B repairs came from saved
project versions; preserve downloaded backups for newer custom account edits.
GitHub is a source backup and does not continuously synchronize the live n8n canvases.
The current test command is in the root README and reads the committed extractor
export, with no dependency on a developer's Downloads path.
