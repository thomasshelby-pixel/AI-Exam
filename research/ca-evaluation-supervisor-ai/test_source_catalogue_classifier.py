#!/usr/bin/env python3
"""Regression checks for the inline source-link classifier in the Colab notebook."""
from __future__ import annotations

import ast
import json
import re
import urllib.parse
from datetime import date
from pathlib import Path

NOTEBOOK = Path(__file__).with_name("train_evaluation_supervisor_colab.ipynb")
notebook = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
cell = next(
    c for c in notebook["cells"]
    if c.get("cell_type") == "code"
    and "def infer_material_type" in "".join(c.get("source", []))
)
source = "".join(cell.get("source", []))
tree = ast.parse(source)
needed = {"parse_attempt", "infer_course", "infer_material_type", "classify"}
definitions = [
    node for node in tree.body
    if isinstance(node, ast.FunctionDef) and node.name in needed
]
assert {node.name for node in definitions} == needed, "Notebook classifier function(s) missing."
namespace = {
    "re": re,
    "urllib": urllib,
    "date": date,
    "START_DATE": date(2024, 5, 1),
    "END_DATE": date(2026, 9, 30),
    "OFFICIAL_HOSTS": {"icai.org", "boslive.icai.org", "resource.cdn.icai.org"},
}
exec(compile(ast.Module(body=definitions, type_ignores=[]), str(NOTEBOOK), "exec"), namespace)

infer_course = namespace["infer_course"]
infer_material_type = namespace["infer_material_type"]
classify = namespace["classify"]

assert infer_course("CA Foundation MTP September 2026 Series II Accounting") == "CA_FOUNDATION"
assert infer_course("CA Intermediate MTP September 2026 Series II Taxation") == "CA_INTERMEDIATE"
assert infer_course("CA Foundation and Intermediate - Model Test Papers") == "UNKNOWN"

# Link/row/section context, not the generic archive page title, determines the PDF type.
assert infer_material_type("Download | CA Foundation MTP September 2026 Series II | Suggested Answer") == "SUGGESTED_ANSWER"
assert infer_material_type("Download | CA Foundation MTP September 2026 Series II | Question Paper") == "MTP"
assert infer_material_type("RTP | September 2024 | Foundation Accounting") == "RTP"
assert infer_material_type("Question Paper | May 2024 | CA Intermediate") == "PYQ"
assert infer_material_type("MCQ Answer Key | May 2026") == "MCQ_KEY"

_, kind, attempt, series, date_status, _, _ = classify(
    "Download",
    "https://boslive.icai.org/example.pdf",
    "ICAI BoS archive: MTPs, RTPs and Suggested Answers for Foundation and Intermediate",
)
assert kind == "OTHER", f"Generic page title incorrectly classified a file as {kind}"
assert attempt == "ATTEMPT_UNCONFIRMED"
assert date_status == "NEEDS_ATTEMPT_REVIEW"

_, kind, attempt, series, date_status, _, _ = classify(
    "CA Foundation MTP September 2026 Series II | Suggested Answer | Accounting",
    "https://resource.cdn.icai.org/example.pdf",
    "ICAI BoS archive: MTPs, RTPs and Suggested Answers",
)
assert kind == "SUGGESTED_ANSWER"
assert attempt == "SEPTEMBER_2026"
assert series == "SERIES_II"
assert date_status == "IN_RANGE"

# Ensure targeted fallback sources stay enabled.
all_code = "\\n".join("".join(c.get("source", [])) for c in notebook["cells"])
for host in ("careers360.com", "zeroinfy.in", "catestseries.org", "capitaltrainers.com"):
    assert host in all_code, f"Fallback source missing: {host}"

print("✅ Source classifier regressions passed: course, material type, generic-page safety, attempt, series, and fallback sources.")
