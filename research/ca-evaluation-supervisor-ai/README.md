# CA Exam Checker AI — Evaluation Supervisor Model (Research)

This folder contains an isolated QLoRA fine-tuning pipeline for a small supervisor model. It does **not** retrain or overwrite the existing CA Study Planner model.

## What the adapter is intended to do

Given a structured evaluation package, flag inconsistencies such as:
- an attempted answer missing from the evaluation;
- missing, non-numeric, negative, or over-maximum marks;
- a final-total or component-allocation mismatch;
- an evaluation linked to the wrong question reference;
- an official reference that could not be locked;
- a contradiction between recorded evidence, the evaluator rationale, and assigned marks;
- a checking mode that differs from the student's selected mode;
- a valid alternative method rejected just because it differs from the Suggested Answer's wording/method;
- zero marks where independently correct steps justify proportional partial credit;
- a deduction that the supplied marking rules do not allow.

The supervisor prompt explicitly distinguishes the three existing modes:
- **standard:** balanced, source-grounded rubric application with proportionate step marks;
- **strict:** rigorous scrutiny, but valid alternative methods and consequential credit remain protected;
- **lenient:** recognize valid intermediate steps/concepts, without exceeding component or question maximums.

## Foundation + Intermediate source archive (May 2024–September 2026)

The [Colab notebook](https://colab.research.google.com/github/thomasshelby-pixel/AI-Exam/blob/main/research/ca-evaluation-supervisor-ai/train_evaluation_supervisor_colab.ipynb) builds a source catalogue for **CA Foundation and CA Intermediate** from May 2024 through September 2026. If Colab has exhausted the user's GPU quota, use the [Kaggle GPU notebook](https://github.com/thomasshelby-pixel/AI-Exam/blob/main/research/ca-evaluation-supervisor-ai/train_evaluation_supervisor_kaggle.ipynb) to run the QLoRA training and download a single adapter ZIP. The Colab notebook remains useful on CPU for source discovery and synthetic dataset generation. This archive targets Categories include MTP/mock tests (Series I and II), matching Suggested Answers/marking guidance, RTPs, actual exam question papers, MCQ keys, applicable study material, amendments and applicability notices.

Discovery is **ICAI/BoS first**. If a resource is not found there, the notebook also checks secondary archive pages including CAprep, CA Study Web, VSI Jaipur, CAWizard, OpenMock and Jobaaj. Those are secondary and unverified, not official ICAI endorsements. The catalogue captures the source URL, course, attempt, series, type, source tier and date confidence. Dates outside the range are marked out-of-scope; unknown dates need review; syllabus/applicability documents are retained as curriculum-reference candidates.

The batch importer asks for **separate rights confirmation** for (1) official ICAI/BoS material and (2) secondary archive sources. Answer YES only for the category whose specific files and AI training/retrieval storage are covered by written permission/licensing. The downloader filters sources to the confirmed categories; a mirror being publicly available is not sufficient permission. On Colab it batch-fetches confirmed PDFs into the user's Google Drive; on Kaggle it saves into the working directory for the user to export. It hashes files and extracts selectable text but does not push PDFs to GitHub.

Attempt-dated PDFs inside the requested window are placed under `in_date_window/`. Curriculum/applicability documents and PDFs whose attempt couldn't be confidently identified go into separate review folders with manifest flags; uncertain files must not be treated as confirmed May 2024–September 2026 training material until checked. Resources detected as explicitly out of range are excluded from the download queue.

Downloaded material is **reference-only**, not supervised training labels. Real-material fine-tuning still requires human-verified student answers, per-component awarded marks, reasons, selected checking mode and adjudicated target outcomes. Synthetic examples spanning both curricula only test the pipeline's integrity logic; they do not prove CA subject-grading accuracy.

## Re-check cost control

The production supervisor now caps targeted correction invocations at **4 per answer-sheet evaluation** across no more than 2 correction rounds. If issues remain after the budget is used, the evaluation fails closed to human review instead of sending more questions to the model. Parallelism is limited to 2 correction calls at a time.

This caps supervisor correction invocations, **not necessarily the exact provider HTTP request count**: the configured model-routing/fallback layer may try another provider if a request fails. Each re-check can increase Gemini/GPT/API token usage and provider charges. It does not intentionally consume an additional student answer-sheet credit by itself; the platform's entitlement remains one evaluation. Provider spend should be measured separately, including fallback attempts, before setting customer pricing.

## Important limitations

1. The included starter dataset is synthetic and contains no student answer sheets or ICAI solution text.
2. Synthetic metrics only verify that the pipeline runs and the model learns the output format. They do **not** establish real-world grading accuracy.
3. Before production use, create a legally permitted, human-reviewed, answer-sheet benchmark with examples of subtle semantic marking issues and a separate held-out test set.
4. Do not feed student copies into training without the necessary rights, privacy disclosures, and a lawful basis.
5. The base model is HuggingFaceTB/SmolLM2-360M-Instruct. This is a small model; it must remain an advisory auditor, never the sole authority for semantic marking.

## Files

- generate_supervisor_dataset.py — reproducibly generates synthetic train/validation/test JSONL files.
- train_supervisor_qlora.py — QLoRA fine-tuning, requires a CUDA GPU (Colab T4 recommended).
- evaluate_supervisor.py — evaluates the untouched base model optionally and the trained adapter on held-out synthetic examples.
- requirements-colab.txt — pinned libraries.
- train_evaluation_supervisor_colab.ipynb — cell-by-cell Google Colab workflow.

## Intended Colab workflow

1. Open the notebook and select Runtime → Change runtime type → T4 GPU.
2. Run the notebook from top to bottom. It mounts Drive, installs the pinned requirements, generates a synthetic dataset, trains a separate adapter, and measures held-out synthetic metrics.
3. The adapter is saved to a new versioned directory under MyDrive/CA_Exam_Checker_AI/training_runs/. It never writes to model_checkpoint_v1, model_weights, or ca_study_ai.joblib.
4. Review the JSON parse rate, issue-code F1, and false-pass rate. Keep the adapter in research if outputs are malformed or the synthetic benchmark is weak.
5. Only after separate human-reviewed test cases pass should an inference service be built and connected to the website. The current Vercel/Firebase production path must not be pointed at an unvalidated adapter.

## Deployment gate

The notebook intentionally labels the adapter NOT_APPROVED for production. An adapter artifact is not a deployment by itself: the website needs a compatible inference endpoint, authentication, timeouts, output validation, and a fail-closed fallback. Deploy the service only after evaluation on real but appropriately authorized and human-reviewed benchmark examples.
