# Current AURA runtime and Creator routing

Updated 16 October 2026. The [root README](../../README.md) identifies all eight
workflows for the complete project; the [test guide](../../Architecture%20%26%20Design/End-to-End-Testing.md)
is the current import and acceptance procedure.

## Current imports

- `DEV - 04B Creator Candidate Selection and Image Routing.json`: reviewed Creator
  backend with native fixed JSON/bodyless paths. It replaces DEV 04.
- Parent directory `DEV - 07 CloudConvert Frame Extraction.json`: reviewed extractor.
- Parent directory `DEV - 10 AURA Essential Scheduled Skills — TEST FIRST.json`:
  native source/skill/artifact transport and stage orchestration.
- Parent directory `DEV - 11 Designer Approval and 48-Hour Cleanup — TEST FIRST.json`:
  human Designer decisions and separately enabled final cleanup. It replaces DEV 05.

DEV 09 in this directory is a **legacy inactive backup**. Do not connect its old
generation-completion ZIP deletion policy. DEV 10 does not depend on DEV 08/08B or
the experimental audit/worker addons.

## Source

- `essential-runtime.mjs`, `essential_materializer.py`: active four-skill IO bridge;
  attempt limits, independent review, actual reference delivery and artifact persistence.
- `designer-cleanup-runtime.mjs`, `final-cleanup-plan.mjs`: current Designer/final cleanup.
- `selection-core.mjs`, `traversal-core.mjs`, `routing-engine.mjs`: human Creator routing.
- `build-essential-workflow.mjs`, `build-designer-cleanup-workflow.mjs`,
  `build-extractor-workflow.mjs`, `build-reviewed-creator-workflow.mjs`: reviewed builders.
  The extractor repair builder accepts the original export as an explicit argument;
  offline import tests validate the committed reviewed extractor directly.
- Older `build-routing`/`build-draft` source remains as Creator implementation history.
  Use the reviewed canonical export above for imports.

All imported defaults are inactive. DEV 10 has paid execution disabled; DEV 11 has
cleanup/purge disabled. Native HTTP Send Body fields are booleans. An IF routes JSON
bodies to separate nodes; do not paste boolean expressions into Content Type.

The `AURA Routing State` table uses `sourcePieceId`, `status`, `owner`, `jobId`,
`jobJson` string columns. `routing-state-seed.csv` supplies the Creator mutex;
`essential-state-seed.csv` supplies the pipeline mutex for a **new empty installation**.
The current account already has both rows; never import duplicates.

Keep Drive credentials and each website's own Basic Auth reference. DEV 04B expects
`AURA Creator Review`; DEV 11 expects `AURA Designer Review Login`.
Journals and locks remain necessary to prevent duplicate paid requests and file moves.
Reconcile an uncertain execution before releasing its owner; never erase paid progress.

## Offline verification

Use Node 24 from this directory:

```sh
node --test essential-runtime.test.mjs import-contract.test.mjs routing-engine.test.mjs selection-core.test.mjs traversal-core.test.mjs final-cleanup-plan.test.mjs
python3 -m unittest test_essential_materializer.py
```

The current suite is offline and does not call OpenAI, CloudConvert, or Drive. Live
conversion, model access, website authentication/image delivery and garment quality
remain acceptance-test outcomes. A real 48-hour purge cannot be proven in one day.
