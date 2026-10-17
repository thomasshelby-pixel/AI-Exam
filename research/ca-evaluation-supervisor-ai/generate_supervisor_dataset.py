#!/usr/bin/env python3
"""Generate synthetic, non-student-data examples for the CA evaluation supervisor.

This dataset is only a format/consistency prototype. It is not an ICAI marking
benchmark and must not be presented as evidence of real-world grading accuracy.
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

CATEGORIES = [
    "PASS",
    "MISSING_ATTEMPTED_QUESTION",
    "MISSING_OR_NON_NUMERIC_MARKS",
    "SCORE_OUT_OF_RANGE",
    "FINAL_TOTAL_MISMATCH",
    "COMPONENT_SUM_MISMATCH",
    "REFERENCE_QUESTION_MISMATCH",
    "AUTHORITATIVE_REFERENCE_NOT_LOCKED",
    "RATIONALE_SCORE_CONTRADICTION",
    "UNSUPPORTED_PRESENTATION_DEDUCTION",
    "EVIDENCE_RATIONALE_CONTRADICTION",
]

PHRASING = {
    "train": [
        "Audit this evaluation report for internal consistency and source-grounded integrity.",
        "Act as a quality-control supervisor. Identify explicit evaluation defects.",
        "Check whether the structured report is safe to approve or requires review.",
        "Review the report without re-grading the student's answer or inventing facts.",
    ],
    "validation": [
        "Independently audit the evaluation package and report any supported integrity flags.",
        "Check this output as an evaluation supervisor. Do not assume the evaluator is correct.",
        "Inspect question coverage, scoring consistency and reference alignment.",
    ],
    "test": [
        "Perform an independent integrity audit of the supplied evaluation package.",
        "Review the evaluation for verifiable consistency errors before it is released.",
        "Decide whether this report passes the defined checks or must be reviewed.",
    ],
}

SUBJECTS = [
    "Accounting",
    "Taxation",
    "Corporate and Other Laws",
    "Costing",
    "Audit",
    "Financial Management",
]
ANSWER_SNIPPETS = [
    "The candidate shows a method, working and a final conclusion.",
    "The candidate states a relevant principle, applies it to the facts and concludes.",
    "The candidate provides intermediate steps and a final result.",
    "The candidate gives a short explanation with supporting working.",
]
RUBRIC_COMPONENTS = ["principle", "application", "working", "conclusion"]


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def build_example(rng: random.Random, category: str, sample_id: str, split: str) -> dict[str, Any]:
    ids = ["Q1(a)", "Q1(b)", "Q2(a)"]
    max_marks = {qid: rng.choice([4, 5, 6, 8, 10]) for qid in ids}
    awarded = {qid: rng.randint(0, max_marks[qid]) for qid in ids}
    subject = rng.choice(SUBJECTS)
    evaluations = []
    attempts = []
    references = []

    for qid in ids:
        score = awarded[qid]
        maximum = max_marks[qid]
        if score == maximum:
            evidence = {component: "present" for component in RUBRIC_COMPONENTS}
        elif score == 0:
            evidence = {component: "not_present" for component in RUBRIC_COMPONENTS}
        else:
            evidence = {
                component: rng.choice(["present", "partially_present", "not_present"])
                for component in RUBRIC_COMPONENTS
            }
            if not any(value in ("present", "partially_present") for value in evidence.values()):
                evidence["working"] = "partially_present"
            if all(value == "present" for value in evidence.values()):
                evidence["conclusion"] = "partially_present"
        attempts.append({
            "question_id": qid,
            "attempted": True,
            "readable": True,
            "answer_summary": rng.choice(ANSWER_SNIPPETS),
            "evidence_points": evidence,
        })
        references.append({
            "question_id": qid,
            "question_paper_found": True,
            "suggested_answer_found": True,
            "marking_scheme_found": True,
        })
        evaluations.append({
            "question_id": qid,
            "maximum_marks": maximum,
            "awarded_marks": score,
            "status": "correct" if score == maximum else "partially_correct" if score > 0 else "incorrect",
            "reason": (
                "Full marks awarded; the evaluated requirements are complete."
                if score == maximum
                else "Some supported credit was awarded; at least one requirement needs improvement."
                if score > 0
                else "The response did not demonstrate a scorable required element."
            ),
            "evidence_points": evidence,
            "reference_question_id": qid,
            "marking_components": [{
                "component": "overall_rubric",
                "marks_available": maximum,
                "marks_awarded": score,
            }],
        })

    case: dict[str, Any] = {
        "case_id": sample_id,
        "subject": subject,
        "paper_structure": [{"question_id": q, "maximum_marks": max_marks[q]} for q in ids],
        "attempted_answers": attempts,
        "references": references,
        "marking_rules": {
            "maximum_marks_are_authoritative": True,
            "presentation_deductions_allowed": False,
        },
        "evaluation": evaluations,
        "reported_total_marks": sum(awarded.values()),
        "instruction": (
            "Audit the data. Never invent or directly change marks. Flag issues with a question id and action. "
            "If a reference cannot be locked, require review rather than guessing. Return JSON only."
        ),
    }
    target: dict[str, Any] = {"decision": "PASS", "issues": []}

    def flag(code: str, qid: str | None, action: str, detail: str) -> None:
        target["decision"] = "REVIEW"
        target["issues"].append({
            "code": code,
            "question_id": qid,
            "action": action,
            "explanation": detail,
        })

    if category == "MISSING_ATTEMPTED_QUESTION":
        qid = ids[-1]
        case["evaluation"] = [e for e in evaluations if e["question_id"] != qid]
        case["reported_total_marks"] = sum(e["awarded_marks"] for e in case["evaluation"])
        flag(category, qid, "RE_EVALUATE_QUESTION", "An attempted answer is absent from the evaluation list.")
    elif category == "MISSING_OR_NON_NUMERIC_MARKS":
        qid = rng.choice(ids)
        entry = next(e for e in evaluations if e["question_id"] == qid)
        entry["awarded_marks"] = None
        entry["status"] = "unclear"
        entry["reason"] = "The evaluator did not return a numeric mark."
        case["reported_total_marks"] = sum(e["awarded_marks"] or 0 for e in evaluations)
        flag(category, qid, "RE_EVALUATE_QUESTION", "The question has no numeric awarded-mark value.")
    elif category == "SCORE_OUT_OF_RANGE":
        qid = rng.choice(ids)
        entry = next(e for e in evaluations if e["question_id"] == qid)
        entry["awarded_marks"] = entry["maximum_marks"] + 1 if rng.random() < 0.5 else -1
        entry["marking_components"][0]["marks_awarded"] = entry["awarded_marks"]
        case["reported_total_marks"] = sum(e["awarded_marks"] for e in evaluations)
        flag(category, qid, "REJECT_INVALID_SCORE", "Awarded marks are outside the allowed range of zero to maximum marks.")
    elif category == "FINAL_TOTAL_MISMATCH":
        case["reported_total_marks"] += rng.choice([1, 2, 3])
        flag(category, None, "RECALCULATE_TOTAL", "The reported final total does not equal the sum of numeric question marks.")
    elif category == "COMPONENT_SUM_MISMATCH":
        qid = rng.choice(ids)
        entry = next(e for e in evaluations if e["question_id"] == qid)
        # Ensure the sample really contains a component-sum mismatch even if the random score was zero.
        if entry["awarded_marks"] == 0:
            entry["awarded_marks"] = 2
            entry["status"] = "partially_correct"
            case["reported_total_marks"] = sum(e["awarded_marks"] for e in evaluations)
        entry["marking_components"][0]["marks_awarded"] = entry["awarded_marks"] - 1
        flag(category, qid, "RECHECK_MARK_ALLOCATION", "Question marks disagree with the sum of its marking-component scores.")
    elif category == "REFERENCE_QUESTION_MISMATCH":
        qid = ids[0]
        other = ids[1]
        entry = next(e for e in evaluations if e["question_id"] == qid)
        entry["reference_question_id"] = other
        flag(category, qid, "RETRIEVE_CORRECT_REFERENCE_AND_REEVALUATE", "The evaluation is linked to a different question's reference.")
    elif category == "AUTHORITATIVE_REFERENCE_NOT_LOCKED":
        qid = ids[1]
        ref = next(r for r in references if r["question_id"] == qid)
        ref["suggested_answer_found"] = False
        flag(category, qid, "HUMAN_REVIEW", "The authoritative suggested-answer reference is missing; the evaluator must not guess.")
    elif category == "RATIONALE_SCORE_CONTRADICTION":
        qid = ids[0]
        entry = next(e for e in evaluations if e["question_id"] == qid)
        entry["awarded_marks"] = max(0, entry["maximum_marks"] - 2)
        entry["status"] = "partially_correct"
        entry["reason"] = "All required points are present and correct; full marks are warranted."
        entry["evidence_points"] = {k: "present" for k in RUBRIC_COMPONENTS}
        next(a for a in attempts if a["question_id"] == qid)["evidence_points"] = dict(entry["evidence_points"])
        entry["marking_components"][0]["marks_awarded"] = entry["awarded_marks"]
        case["reported_total_marks"] = sum(e["awarded_marks"] for e in evaluations)
        flag(category, qid, "RECHECK_REASONING_AND_MARKS", "The rationale claims complete correct work but the score is below maximum.")
    elif category == "UNSUPPORTED_PRESENTATION_DEDUCTION":
        qid = ids[0]
        entry = next(e for e in evaluations if e["question_id"] == qid)
        entry["awarded_marks"] = max(0, entry["maximum_marks"] - 1)
        entry["status"] = "partially_correct"
        entry["reason"] = "One mark was deducted solely because the presentation was untidy."
        entry["evidence_points"] = {k: "present" for k in RUBRIC_COMPONENTS}
        next(a for a in attempts if a["question_id"] == qid)["evidence_points"] = dict(entry["evidence_points"])
        entry["marking_components"][0]["marks_awarded"] = entry["awarded_marks"]
        case["reported_total_marks"] = sum(e["awarded_marks"] for e in evaluations)
        flag(category, qid, "RECHECK_DEDUCTION", "The configured marking rules do not allow a presentation-only deduction.")
    elif category == "EVIDENCE_RATIONALE_CONTRADICTION":
        qid = ids[2]
        entry = next(e for e in evaluations if e["question_id"] == qid)
        entry["awarded_marks"] = max(0, entry["maximum_marks"] - 1)
        entry["status"] = "partially_correct"
        entry["reason"] = "The required principle and application are missing."
        entry["evidence_points"] = {
            "principle": "present",
            "application": "present",
            "working": "present",
            "conclusion": "present",
        }
        next(a for a in attempts if a["question_id"] == qid)["evidence_points"] = dict(entry["evidence_points"])
        entry["marking_components"][0]["marks_awarded"] = entry["awarded_marks"]
        case["reported_total_marks"] = sum(e["awarded_marks"] for e in evaluations)
        flag(category, qid, "RECHECK_REASONING_AND_MARKS", "The recorded answer evidence conflicts with the stated reason for deduction.")
    elif category != "PASS":
        raise ValueError("Unknown category: " + category)

    request = rng.choice(PHRASING[split])
    input_text = request + "\nReturn exactly one JSON object with keys decision and issues.\nEvaluation package:\n" + json_text(case)
    return {
        "id": sample_id,
        "category": category,
        "input": input_text,
        "target": json_text(target),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/content/ca-evaluation-supervisor-data")
    parser.add_argument("--train-per-category", type=int, default=160)
    parser.add_argument("--validation-per-category", type=int, default=30)
    parser.add_argument("--test-per-category", type=int, default=40)
    parser.add_argument("--seed", type=int, default=20261017)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    counts = {
        "train": args.train_per_category,
        "validation": args.validation_per_category,
        "test": args.test_per_category,
    }
    summary = {"dataset_kind": "synthetic_only", "real_student_data_used": False, "seed": args.seed, "counts": {}}

    for split, count in counts.items():
        split_rng = random.Random(args.seed + {"train": 0, "validation": 10_000, "test": 20_000}[split])
        examples = []
        for category in CATEGORIES:
            for index in range(count):
                sample_id = f"{split}-{category.lower()}-{index:04d}"
                examples.append(build_example(split_rng, category, sample_id, split))
        split_rng.shuffle(examples)
        path = output_dir / f"{split}.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for example in examples:
                f.write(json_text(example) + "\n")
        summary["counts"][split] = {
            "examples": len(examples),
            "per_category": count,
            "path": str(path),
        }

    (output_dir / "dataset_manifest.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))
    print(
        "\nIMPORTANT: These synthetic examples test structure/consistency behaviour only. "
        "Before production use, add a separate held-out benchmark of human-reviewed examples "
        "that you have the right to process."
    )


if __name__ == "__main__":
    main()
