# CA Exam Checker AI — session checkpoint (17 October 2026)

## User's current goal
Build and train a CA answer-evaluation research assistant for both CA Foundation and CA Intermediate. Collect exam materials for attempts from May 2024 through September 2026 inclusive, preferring official ICAI/BoS resources and using secondary archives when official links are blocked/missing.

## Current saved Google Drive archive
`/content/drive/MyDrive/CA_Exam_Checker_AI/training_runs/bos_reference_catalog/May2024_to_Sep2026_20261017T095236Z`

Files/reports already recorded by the user:
- `source_catalog.csv`
- `reference_manifest.json`
- `retry_queue.csv`
- `material_inventory.csv`
- `download_coverage.csv`
- `global_material_coverage.csv`
- `global_failed_links.csv`
- `reference_pdfs/in_date_window/secondary_catestseries_sep2025/`
- `question_answer_pairing_audit.csv` inside the September 2025 MTP archive

## Last reported source coverage
- 862 catalogue links: 211 official ICAI/BoS, 651 secondary/unverified, 139 course-unknown.
- One inventory reported 184 unique downloaded files: Foundation had 1 MCQ key, 4 PYQ and 12 Suggested Answers; Intermediate had 18 MTP, 30 PYQ, 18 RTP and 101 Suggested Answers.
- The broader manifest reports inconsistent counts (e.g. 58 unresolved and 23 extraction review) versus an earlier extraction pass reporting 160 text-extracted files. Reconcile the manifest/inventory on resume; don't assume every counter refers to the same unique physical files.
- BoS direct PDF links for a group of 23 items returned HTTP 403. Alternate-source import recovered a 23-file batch for September 2025 Intermediate MTP Series I/II.
- The user later fetched the missing Series I Corporate & Other Laws question paper from a Google Drive URL and updated the manifest.
- User confirmed that they have permission to use the materials for training. The latest importer asks separately whether that permission covers official ICAI/BoS files and secondary-site files; confirm only the categories actually covered by the permission.
- Pairing audit for September 2025 Intermediate Series I and II: all 12 subject-level question/answer pairs were marked PAIR_COMPLETE after the missing Series I Corporate & Other Laws question was added.

## Runtime status
- User's Colab free GPU quota is exhausted. Source discovery, catalogue checks, and PDF download/text extraction can run without GPU. Actual QLoRA fine-tuning and GPU-based evaluation need an available GPU.
- A Kaggle GPU notebook exists at `research/ca-evaluation-supervisor-ai/train_evaluation_supervisor_kaggle.ipynb`, but Kaggle GPU availability/quota is not guaranteed.
- Training has not been demonstrated as completed. Existing synthetic dataset/training pipeline is only an evaluation-integrity supervisor prototype; it is not yet a full subject-matter CA examiner and no real-answer benchmark has been run.

## Resume instructions
1. Reopen the updated Colab notebook:
   https://colab.research.google.com/github/thomasshelby-pixel/AI-Exam/blob/main/research/ca-evaluation-supervisor-ai/train_evaluation_supervisor_colab.ipynb
2. Connect without GPU if Colab blocks GPU access.
3. Re-run the source/import cell. It now reuses the latest archive folder, skips files already present in Drive, and updates the manifest after every download attempt.
4. First reconcile counts and generate a clean course × attempt × material-type gap report.
5. Complete the missing Foundation MTP/PYQ/Suggested Answer coverage and remaining Intermediate gaps.
6. Keep question paper + matching answer + curriculum/attempt pairing aligned; do not treat Suggested Answers alone as supervised labels.
7. Build a human-verified answer + rubric + component-mark dataset before claiming improved real marking accuracy.
8. Use a GPU runtime (Kaggle if available or Colab when quota returns) for QLoRA training; keep the adapter research-only pending held-out real-answer evaluation.

Do not delete the Drive archive, overwrite the existing study-planner model, or merge/deploy a model without passing checks.
