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

## MTP/PYQ source materials

The Colab notebook lets you upload a Question Paper and its matching Suggested Answer (plus the official marking scheme if available) as a paired reference pack into your own Google Drive. It extracts selectable PDF text and records source hashes and page counts. It does not upload these PDFs to GitHub.

A reference PDF alone is **not** a supervised training example. For real-material fine-tuning, add human-verified cases that pair the relevant question/reference with the student's answer, applicable marks/rubric, the selected checking mode, and an adjudicated target outcome. Do not manufacture labels from a Suggested Answer alone.

The model only produces audit flags and review actions. It does not set the final score, override deterministic integrity gates, or certify a copy by itself. The existing TypeScript supervisor and correction loop remain the safety layer.

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
