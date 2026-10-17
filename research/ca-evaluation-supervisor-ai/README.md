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

## Foundation + Intermediate source materials

The Colab notebook now scans official ICAI/BoS pages for **both CA Foundation and CA Intermediate** and writes a source catalogue (CSV/JSON) into the user's Google Drive. It targets MTP/mock tests (Series I and II where available), matching Suggested Answers, RTPs, previous-year question papers, applicability/amendment notices, and course material. It does not push PDFs or extracted content to GitHub.

PDF downloading is deliberately **off by default**. ICAI/BoS copyright notices state that use in a retrieval system requires written permission. The notebook only downloads official-domain PDFs after the user explicitly sets the permission acknowledgement. Publicly viewable links are not proof of permission, and the notebook should remain in catalogue-only mode until written permission is confirmed.

Downloaded PDFs/text are **reference-only**, not supervised training labels. For real-material fine-tuning, add human-verified cases pairing the relevant question/reference with a student's answer, applicable marks/rubric, selected checking mode, and an adjudicated target outcome. Never manufacture labels from a Suggested Answer alone. Synthetic examples cover both Foundation and Intermediate subject families, but this is only a structural/consistency prototype, not subject-mastery evidence.

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
