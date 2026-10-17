#!/usr/bin/env python3
"""Prepare evaluated CA answer-copy PDFs for human-reviewed benchmark creation.

This script does not create fine-tuning JSONL. It extracts only structured metadata
and question/subquestion marks that are already text-accessible in the result-summary
pages; scanned handwritten answer pages remain image input and need human-reviewed
transcription/reference mapping before becoming supervised examples.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

import fitz

MAX_ARCHIVE_BYTES = 250 * 1024 * 1024
MAX_PDF_COUNT = 20
MAX_PDF_BYTES = 80 * 1024 * 1024
QUESTION_ID_RE = re.compile(r"^\d{1,2}[a-z]?(?:step(?:\d+|[a-z]+))?$", re.I)
MARK_LINE_RE = re.compile(r"^(\d+(?:\.\d+)?)\s+marks?$", re.I)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_basename(name: str) -> str:
    # Only retain a basename; archive directory structure is not trusted.
    return PurePosixPath(name.replace("\\", "/")).name


def first_match(pattern: str, text: str, default: str = "") -> str:
    match = re.search(pattern, text, re.I | re.S)
    return match.group(1).strip() if match else default


def _to_float(value: Any) -> float | None:
    try:
        if value is None or str(value).strip() == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_header(all_text: str, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    fallback = fallback or {}
    # Header text repeats on most pages; read from the first 100 extracted lines only.
    header_text = "\n".join(all_text.splitlines()[:100])
    subject = first_match(
        r"Subject\s*:\s*\n?\s*(.*?)(?=\n\s*Marks\s+Obtained|\n\s*Page\s+\d+|\n\s*Total\s+Marks)",
        header_text,
    )
    maximum = first_match(r"Total\s+Marks\s*:\s*\n?\s*(\d+(?:\.\d+)?)", header_text)
    awarded = first_match(r"Marks\s+Obtained\s*:\s*\n?\s*(\d+(?:\.\d+)?)", header_text)
    return {
        "subject": subject or str(fallback.get("subject", "UNKNOWN")),
        "maximum_marks": float(maximum) if maximum else _to_float(fallback.get("maximum_marks")),
        "marks_awarded_total": float(awarded) if awarded else _to_float(fallback.get("marks_awarded_total")),
    }


def inventory_from_source_csv(zf: zipfile.ZipFile) -> dict[str, dict[str, Any]]:
    # Look by basename so the pack may be placed beneath a different top-level folder.
    name = next((n for n in zf.namelist() if PurePosixPath(n).name.lower() == "inventory.csv"), None)
    if not name:
        return {}
    import io
    raw = zf.read(name)
    rows = csv.DictReader(io.StringIO(raw.decode("utf-8-sig", errors="replace")))
    index: dict[str, dict[str, Any]] = {}
    for row in rows:
        basename = safe_basename(row.get("file", ""))
        if basename:
            index[basename] = row
    return index


def extract_question_rows(doc: fitz.Document, summary_index: int) -> list[dict[str, Any]]:
    """Extract structured question/subquestion marks from PDF result-summary tables."""
    records: list[dict[str, Any]] = []
    if summary_index < 0:
        return records
    for page_index in range(summary_index, len(doc)):
        page = doc[page_index]
        text = page.get_text("text")
        try:
            tables = page.find_tables().tables
        except Exception:
            tables = []
        for table in tables:
            try:
                rows = table.extract() or []
            except Exception:
                continue
            for row in rows:
                values = [str(cell).strip() if cell is not None else "" for cell in row]
                folded = " ".join(values).lower()
                if "question no" in folded and "awarded marks" in folded and "maximum marks" in folded:
                    continue
                compact = [value for value in values if value]
                if len(compact) < 3:
                    continue
                question_id = compact[0]
                if not QUESTION_ID_RE.fullmatch(question_id):
                    continue
                awarded = _to_float(compact[1])
                maximum = _to_float(compact[2])
                if awarded is None or maximum is None or maximum <= 0:
                    continue
                records.append({
                    "question_id": question_id,
                    "awarded_marks": awarded,
                    "maximum_marks": maximum,
                    "summary_page": page_index + 1,
                    "extraction_method": "pymupdf_table",
                })
        # Fallback for PDF engines that expose row text but no table structures.
        if not any(record["summary_page"] == page_index + 1 for record in records):
            for line in text.splitlines():
                compact = line.split()
                if len(compact) < 3 or not QUESTION_ID_RE.fullmatch(compact[0]):
                    continue
                awarded = _to_float(compact[1])
                maximum = _to_float(compact[2])
                if awarded is not None and maximum is not None and maximum > 0:
                    records.append({
                        "question_id": compact[0],
                        "awarded_marks": awarded,
                        "maximum_marks": maximum,
                        "summary_page": page_index + 1,
                        "extraction_method": "line_text_fallback",
                    })
    unique: dict[tuple[Any, ...], dict[str, Any]] = {}
    for row in records:
        key = (row["question_id"].lower(), row["awarded_marks"], row["maximum_marks"])
        unique.setdefault(key, row)
    return list(unique.values())


def extract_step_annotations(doc: fitz.Document) -> list[dict[str, Any]]:
    """Find labels like '1aStep1' followed by selectable-text '0 Marks' on a page."""
    records = []
    for page_index, page in enumerate(doc):
        lines = [line.strip() for line in page.get_text("text").splitlines()]
        for i in range(len(lines) - 1):
            label = lines[i]
            mark_match = MARK_LINE_RE.fullmatch(lines[i + 1])
            if not mark_match or not QUESTION_ID_RE.fullmatch(label):
                continue
            records.append({
                "question_or_step_id": label,
                "marks_detected": float(mark_match.group(1)),
                "source_page": page_index + 1,
                "extraction_method": "selectable_mark_overlay_text",
                "human_verified": "NO",
            })
    unique = {}
    for row in records:
        key = (row["question_or_step_id"].lower(), row["marks_detected"], row["source_page"])
        unique.setdefault(key, row)
    return list(unique.values())


def write_csv(path: Path, rows: list[dict[str, Any]], columns: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def prepare(zip_path: Path, output_dir: Path, expected_pdf_count: int = 8) -> dict[str, Any]:
    if not zip_path.is_file():
        raise FileNotFoundError(f"ZIP not found: {zip_path}")
    if zip_path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("Archive exceeds the allowed 250 MB preparation limit.")

    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_dir = output_dir / "source_pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path) as zf:
        bad = zf.testzip()
        if bad:
            raise ValueError(f"Corrupt ZIP member: {bad}")
        pdf_members = [item for item in zf.infolist() if not item.is_dir() and item.filename.lower().endswith(".pdf")]
        if not pdf_members:
            raise ValueError("No PDF files were found in the uploaded ZIP.")
        if len(pdf_members) > MAX_PDF_COUNT:
            raise ValueError(f"Found {len(pdf_members)} PDFs; cap is {MAX_PDF_COUNT}.")
        if expected_pdf_count and len(pdf_members) != expected_pdf_count:
            raise ValueError(f"Expected {expected_pdf_count} evaluated-copy PDFs, found {len(pdf_members)}.")

        source_index = inventory_from_source_csv(zf)
        file_manifest: list[dict[str, Any]] = []
        page_records: list[dict[str, Any]] = []
        question_records: list[dict[str, Any]] = []
        step_records: list[dict[str, Any]] = []
        integrity_records: list[dict[str, Any]] = []
        names_seen: set[str] = set()

        for info in pdf_members:
            basename = safe_basename(info.filename)
            if not basename or basename in names_seen:
                raise ValueError(f"Duplicate or unsafe PDF basename: {basename}")
            names_seen.add(basename)
            if info.file_size > MAX_PDF_BYTES:
                raise ValueError(f"PDF exceeds 80 MB limit: {basename}")
            data = zf.read(info)
            if not data.startswith(b"%PDF"):
                raise ValueError(f"ZIP member is not a valid PDF header: {basename}")
            target = pdf_dir / basename
            target.write_bytes(data)
            source = source_index.get(basename, {})

            with fitz.open(stream=data, filetype="pdf") as doc:
                if not len(doc):
                    raise ValueError(f"PDF contains no pages: {basename}")
                page_texts: list[str] = []
                local_image_pages = 0
                for page_index, page in enumerate(doc):
                    text = page.get_text("text")
                    page_texts.append(text)
                    image_count = len(page.get_images(full=True))
                    local_image_pages += int(image_count > 0)
                    page_records.append({
                        "source_file": basename,
                        "page_number": page_index + 1,
                        "text_characters": len(text.strip()),
                        "embedded_image_count": image_count,
                        "has_result_overview": "result overview" in text.lower(),
                        "contains_selectable_mark_overlay": bool(
                            re.search(r"\b\d+[a-z]?step\d+\b|\b\d+(?:\.\d+)?\s+Marks?\b", text, re.I)
                        ),
                        "review_status": "IMAGE_OR_TEXT_PAGE_REVIEW_REQUIRED",
                    })
                all_text = "\n".join(page_texts)
                header = parse_header(all_text, source)
                summary_index = next(
                    (index for index, text in enumerate(page_texts) if "result overview" in text.lower()),
                    -1,
                )
                qrows = extract_question_rows(doc, summary_index)
                srows = extract_step_annotations(doc)

                for row in qrows:
                    qid = row["question_id"].lower()
                    children = [
                        child for child in qrows
                        if re.fullmatch(re.escape(qid) + r"[a-z]", child["question_id"].lower())
                    ]
                    is_numeric_parent = qid.isdigit() and bool(children)
                    row_level = (
                        "question_total_with_children" if is_numeric_parent
                        else "subquestion" if not qid.isdigit()
                        else "question_total"
                    )
                    question_records.append({
                        "exam_cycle": "May 2026",
                        "course": "CA Intermediate",
                        "subject": header["subject"],
                        "copy_file": basename,
                        "copy_sha256": sha256_bytes(data),
                        "question_id": row["question_id"],
                        "row_level": row_level,
                        "awarded_marks": row["awarded_marks"],
                        "maximum_marks": row["maximum_marks"],
                        "summary_page": row["summary_page"],
                        "extraction_method": row["extraction_method"],
                        "student_answer_text": "",
                        "exact_question_paper_ref": "NEEDS_MATCHING_MAY_2026_PAPER",
                        "exact_suggested_answer_ref": "NEEDS_MATCHING_MAY_2026_SUGGESTED_ANSWER",
                        "human_verified": "NO",
                        "training_ready": "NO",
                        "training_blocker": (
                            "Handwritten answer pages are image-based; visually review/transcribe answer evidence "
                            "and lock matching question paper/Suggested Answer before training."
                        ),
                    })

                # Check overall total using only top-level numeric question rows (avoid double-counting subparts).
                parents = [row for row in qrows if row["question_id"].isdigit()]
                extracted_total = round(sum(row["awarded_marks"] for row in parents), 3) if parents else None
                overall_total = header["marks_awarded_total"]
                total_status = (
                    "MATCH" if extracted_total is not None and overall_total is not None
                    and abs(extracted_total - overall_total) <= 0.05
                    else "MISMATCH_OR_INCOMPLETE" if extracted_total is not None and overall_total is not None
                    else "COULD_NOT_VERIFY"
                )
                integrity_records.append({
                    "copy_file": basename,
                    "subject": header["subject"],
                    "maximum_marks": header["maximum_marks"],
                    "marks_awarded_total": overall_total,
                    "question_rows_extracted": len(qrows),
                    "step_mark_labels_extracted": len(srows),
                    "sum_top_level_question_marks": extracted_total,
                    "overall_total_check": total_status,
                    "result_summary_page": summary_index + 1 if summary_index >= 0 else "NOT_FOUND",
                    "source_sha256": sha256_bytes(data),
                })
                for row in srows:
                    step_records.append({"copy_file": basename, "subject": header["subject"], **row})
                file_manifest.append({
                    "file": basename,
                    "source_zip_member": info.filename,
                    "sha256": sha256_bytes(data),
                    "bytes": len(data),
                    "page_count": len(doc),
                    "subject": header["subject"],
                    "maximum_marks": header["maximum_marks"],
                    "marks_awarded_total": overall_total,
                    "summary_page": summary_index + 1 if summary_index >= 0 else None,
                    "question_rows_extracted": len(qrows),
                    "step_mark_labels_extracted": len(srows),
                    "image_heavy_pages": local_image_pages,
                    "status": "REFERENCE_ONLY_NEEDS_HUMAN_REVIEW",
                })

    review_rows = []
    for row in question_records:
        review_rows.append({
            **row,
            "question_text": "",
            "human_transcribed_answer": "",
            "rubric_components_json": "",
            "human_verified_step_marks_json": "",
            "checking_mode": "standard",
            "reviewer_notes": "",
        })

    write_csv(output_dir / "pdf_page_inventory.csv", page_records, [
        "source_file", "page_number", "text_characters", "embedded_image_count",
        "has_result_overview", "contains_selectable_mark_overlay", "review_status",
    ])
    write_csv(output_dir / "question_mark_candidates.csv", question_records, [
        "exam_cycle", "course", "subject", "copy_file", "copy_sha256", "question_id",
        "row_level", "awarded_marks", "maximum_marks", "summary_page", "extraction_method",
        "student_answer_text", "exact_question_paper_ref", "exact_suggested_answer_ref",
        "human_verified", "training_ready", "training_blocker",
    ])
    write_csv(output_dir / "human_review_template.csv", review_rows, [
        "exam_cycle", "course", "subject", "copy_file", "copy_sha256", "question_id", "row_level",
        "awarded_marks", "maximum_marks", "summary_page", "extraction_method", "student_answer_text",
        "exact_question_paper_ref", "exact_suggested_answer_ref", "human_verified", "training_ready",
        "training_blocker", "question_text", "human_transcribed_answer", "rubric_components_json",
        "human_verified_step_marks_json", "checking_mode", "reviewer_notes",
    ])
    write_csv(output_dir / "step_mark_candidates.csv", step_records, [
        "copy_file", "subject", "question_or_step_id", "marks_detected", "source_page",
        "extraction_method", "human_verified",
    ])
    write_csv(output_dir / "copy_integrity_audit.csv", integrity_records, [
        "copy_file", "subject", "maximum_marks", "marks_awarded_total", "question_rows_extracted",
        "step_mark_labels_extracted", "sum_top_level_question_marks", "overall_total_check",
        "result_summary_page", "source_sha256",
    ])

    manifest = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "input_zip": zip_path.name,
        "input_zip_sha256": sha256_bytes(zip_path.read_bytes()),
        "course": "CA Intermediate",
        "exam_cycle": "May 2026",
        "source_pdf_count": len(file_manifest),
        "source_page_count": sum(item["page_count"] for item in file_manifest),
        "structured_question_mark_candidates": len(question_records),
        "step_mark_overlay_candidates": len(step_records),
        "training_examples_emitted": 0,
        "status": "PREPARATION_ONLY_NOT_TRAINING_DATA",
        "reason": (
            "Current SmolLM2 supervisor is text-only and these student answer pages are image-based. Mark totals alone "
            "are not sufficient training examples; pair exact question papers/Suggested Answers and human-verified "
            "answer/step labels first."
        ),
        "files": file_manifest,
    }
    (output_dir / "preparation_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (output_dir / "README_NEXT_STEPS.txt").write_text(
        "This is a preparation/QA pack, not fine-tuning JSONL.\n"
        "1. Review copy_integrity_audit.csv; expected overall totals should match.\n"
        "2. Use question_mark_candidates.csv as candidate marks, not verified labels.\n"
        "3. Match each row to the exact May 2026 question paper and Suggested Answer.\n"
        "4. Visually review/transcribe the student answer and validate step-level marks in human_review_template.csv.\n"
        "5. Only create supervised records for rows with human_verified=YES, answer evidence and references locked.\n"
        "6. Do not feed raw scanned PDFs directly to text-only SmolLM2; use image-aware extraction or human transcription first.\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True, help="Path to the evaluated-copy ZIP pack")
    parser.add_argument("--output-dir", required=True, help="Private staging/review output folder")
    parser.add_argument("--expected-pdf-count", type=int, default=8)
    args = parser.parse_args()
    manifest = prepare(Path(args.zip), Path(args.output_dir), args.expected_pdf_count)
    print(json.dumps({
        "status": manifest["status"],
        "files": manifest["source_pdf_count"],
        "pages": manifest["source_page_count"],
        "question_mark_candidates": manifest["structured_question_mark_candidates"],
        "step_mark_candidates": manifest["step_mark_overlay_candidates"],
        "training_examples_emitted": manifest["training_examples_emitted"],
        "output_dir": args.output_dir,
    }, indent=2))


if __name__ == "__main__":
    main()
