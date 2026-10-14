# AURA API automation migration

Status: migration in progress, 14 October 2026. Candidate-selection routing and gated
ZIP cleanup are implemented locally and saved as unpublished n8n drafts. The creator
Site update is deployed as version 4; all three Sites remain privately published.
Automated extraction and classifier/generation API calls are not connected.

## Ownership clarified by the user

- The user's teammate owns migration and setup of the generator, reviewer, and auditor
  skills in the OpenAI API project, including the tools and Google Drive access needed
  for those skills to read a piece and write their results.
- This workspace owns n8n preparation and generation handoff workflows, not rewriting
  or uploading those three skills.
- The API skills own placement of completed candidate pools into `Content/AIApproved`.
  Under the revised design, no new candidates are routed to `Content/AIRejected`;
  retain existing historical contents without deleting them.
  n8n must not independently repeat those moves. It checks the job result and persisted
  Drive outcome before treating the handoff as complete.
- An API key authorizes API requests; it does not itself give a skill Google Drive
  access. That access belongs to the teammate's implementation and must be confirmed.
- The additional raw-frame classifier can be a fourth API skill. It is separate from
  the generator, reviewer, and auditor and runs before `READY_FOR_REVIEW.docx` exists.
  The OpenAI project has been created. The teammate's skill setup and secure API-key
  provisioning are still pending; no API key is stored in this repository.

## Requested changes

Replace manual video screenshots with frame extraction and reference classification.
Replace scheduled ChatGPT generation/review tasks with n8n-triggered OpenAI API jobs.
Preserve the existing human approval checkpoints, Drive stage folders, review websites,
and operations dashboard.

## Intended piece lifecycle

1. Existing WeTransfer intake downloads and stores the original assets in the piece's
   `AURA/RawFootage/Received` folder. Handle video files and transfer archives without
   modifying the originals during preparation. The explicitly allowlisted ZIP archives
   are cleaned up only at the later verified-generation checkpoint described below.
2. A new preparation job extracts frames from every relevant video for that piece.
   Keep source file IDs, timestamps, source dimensions, and extraction settings.
3. A vision classifier proposes reference categories. A deterministic router validates
   its structured result and writes selected, sharp, non-duplicate frames into the
   existing reference folders:
   - `01_MATERIAL_CLOSEUPS_4K`
   - `02_WHOLE_FRONT_BACK_SIDE` (record front/back/side labels in the evidence manifest)
   - `03_SIZE_FIT_MODEL_MANNEQUIN`
   Preserve any actual nested folder contract when the latest skill bundles are confirmed.
   Implement the classifier as an API skill if selected: accept frame images with
   immutable IDs and timestamps, and return structured per-frame labels, quality
   flags, uncertainty, and evidence coverage. n8n writes only validated mappings to
   allowlisted destination folders. A classification label is not proof of accuracy.
4. A coverage gate verifies actual front, back, side, material, and fit evidence.
   Missing, ambiguous, conflicting, or inadequate evidence requires manual attention.
   Do not infer hidden garment construction, manufacture missing views, or claim a
   lower-resolution frame is genuine 4K evidence.
5. Only after preparation and coverage checks pass, create a genuine
   `READY_FOR_REVIEW.docx` in the piece folder. The existing DEV 02 workflow detects
   that exact filename and moves the piece to `RawFootage/Processed`.
6. The content creator retains the manual preparation approval. The existing DEV 03
   workflow detects `READY_FOR_AURA.docx` and moves the piece to `RawFootage/Approved`.
   Its existing `REJECTED.docx` rejection route stays intact.
7. A new n8n generation job claims one approved piece, transfers its required inputs,
   invokes the teammate's API-configured skills, and waits for completion. The skills
   implement the sequential four-view generation, independent review, and audit.
8. After successful four-view generation/review, the piece contains the three retained
   reference folders plus `04_PRODUCT_IMAGE_OUTPUTS`. Retain all image attempts under
   `04_PRODUCT_IMAGE_OUTPUTS/_run/candidates/{front,back,three_quarter_front,detail_collage}`:
   at most three images per view and twelve overall. The API skills place the piece in
   `Content/AIApproved`; n8n must not duplicate that move. Root-level final image copies
   do not count as additional creator gallery choices.
9. The creator compares all candidates, including AI-failed attempts, and selects
   exactly one image per view. The four selected images go under the piece in
   `Content/CreatorApproved`; the unselected candidates go under its corresponding
   piece archive in `Content/CreatorRejected`. This replaces whole-piece Good/No Good.
10. The designer still reviews exactly four selected images. Preserve the designer's
    existing approval/rejection stage routes. The dashboard integration must distinguish
    a unique garment from its approved/rejected asset partitions.

## Confirmed candidate layout and archive cleanup

See [the creator-selection handoff](Creator-Candidate-Selection.md) for the exact folder
tree, API contract, selection safety checks, and implementation status.

The original WeTransfer ZIP and extracted-frame ZIP archives are to be permanently
deleted only after successful extraction, retention of the real reference assets, and
accurate four-view generation/review. Persist archive provenance, exact file IDs and
checksums at intake/extraction; check that the retained assets actually exist before
cleanup. Never delete a source reference directory, raw video/photo, or every ZIP found
by a broad search. Permanent deletion is an explicit, auditable cleanup step, not part
of creator selection. No files have been deleted for this change.

## Integration findings

### Video extraction

The supplied [mp4-to-jpg project](https://github.com/allarddewinter/mp4-to-jpg)
is a browser-only HTML video/canvas application, not a hosted HTTP API. Its live
GitHub Pages URL cannot be used as a video-upload API endpoint.

An authenticated extraction service is required for unattended n8n calls. Choose
between adapting the browser implementation and a server-native extractor after
confirming hosting and representative input codecs. No hosting service or paid plan
has been selected. Do not send private videos to an unrelated third-party service.

### OpenAI skills and generation

Official documentation supports uploading versioned skill bundles and attaching them
to a Responses API shell environment:
[Skills](https://developers.openai.com/api/docs/guides/tools-skills).
Image generation is a separately configured tool:
[Image generation](https://developers.openai.com/api/docs/guides/tools-image-generation).

Uploading a skill is not the same as executing it. Adapt ChatGPT-only tool references,
local paths, dependencies, input transfer, image-generation calls, and output collection.
Pin reviewed skill versions. Keep the generator and reviewer contexts independent.
The teammate supplies the configured skill identifiers and invocation details, plus
the input and completion-result contract. We do not require the auditor's source bundle
in this workspace and do not implement or redefine that stage here.

## Reliability and safety requirements

- Use immutable Drive piece/file IDs, not folder-name matching alone.
- Use an idempotency key covering piece ID, source revision/hash, and pipeline version.
- Acquire a job lock before processing; repeated triggers must not duplicate work.
- Persist progress and accepted views so interrupted jobs can resume safely.
- Use bounded extraction limits, classification calls, generation retries, and costs.
- Distinguish infrastructure/API failure from content rejection and missing evidence.
- Write readiness markers last, after assets and validation reports are saved.
- Validate model JSON against a schema and route only to allowlisted folder IDs.
- Keep API keys in server/n8n secret stores, never browser code, chat, or Git.
- Preserve original raw videos and photographs as read-only source evidence; the later
  allowlisted ZIP-container cleanup does not authorize deletion of those assets.
- Do not disable ChatGPT schedules until the replacement is configured and an explicit
  cutover is approved; avoid concurrent schedulers processing the same piece.
- Keep n8n workflows unpublished and do not generate real images until the user
  explicitly authorizes activation/testing.

## Remaining integration prerequisites

1. OpenAI API project/account setup and secure credential provisioning.
2. Teammate-provided skill identifiers, invocation/input format, completion result,
   and confirmation of the skills' working Google Drive integration.
3. Authenticated extraction-service hosting and spending limits.
4. Input video/archive layout and required coverage/quality thresholds.
5. Final generation retry/cost budget, completed-job manifest, and verified ZIP provenance.
6. Explicit activation/cutover approval and a disposable-piece integration test.

The teammate confirmed through the user that skill migration is not complete. Wait
for reviewed IDs/versions and the actual invocation/completion contract; do not treat
creation of the OpenAI project as a working integration. No API key is stored here.

New saved drafts are DEV 04B (`hxCyYxr5to7S1Glv`) and DEV 09 (`f1Gg35SKj3OTiC43`).
DEV 09 will be called only after the future parent records verified generator/reviewer
completion and the original intake manifests. These workflows share `AURA Routing State`
(`0jVQUhHbb9ApVzSH`). See the selection guide for recovery and the record schema.
All n8n workflows remain unpublished. No real Drive moves/deletions or image generation
were performed during this setup. The creator website was deployed separately; the
original workflows remain intact.
