#!/usr/bin/env python3
"""Small, dependency-free helpers for target-preserving causal-LM tokenization."""
from __future__ import annotations

from typing import Sequence


def build_prompt_target_sequence(
    prompt_ids: Sequence[int],
    full_ids: Sequence[int],
    max_length: int,
    truncation_marker_ids: Sequence[int] = (),
) -> tuple[list[int], list[int]]:
    """Build input IDs and labels without truncating the assistant target.

    The tokenizer output for the full conversation must contain an assistant target
    after the common prompt prefix. When the prompt is too long, preserve both its
    beginning (system policy/task framing) and its end (later evidence/JSON fields),
    inserting a visible truncation marker between them. Only prompt tokens are masked
    from the loss; every assistant-target token is retained.
    """
    if max_length < 8:
        raise ValueError("max_length must be at least 8 tokens.")

    prompt = list(prompt_ids)
    full = list(full_ids)

    common_prefix = 0
    max_common = min(len(prompt), len(full))
    while common_prefix < max_common and prompt[common_prefix] == full[common_prefix]:
        common_prefix += 1

    target_ids = full[common_prefix:]
    if not target_ids:
        raise ValueError(
            "No assistant target tokens found after the common prompt prefix. "
            "Check that the conversation template contains the assistant target."
        )
    if len(target_ids) >= max_length:
        raise ValueError(
            f"Assistant target is {len(target_ids)} tokens but max_length is "
            f"{max_length}; target preservation would leave no room for context. "
            "Reduce the target verbosity or increase max_length."
        )

    aligned_prompt = prompt[:common_prefix]
    prompt_budget = max_length - len(target_ids)
    if prompt_budget <= 0:
        raise ValueError("No room remains for prompt context after preserving target tokens.")

    if len(aligned_prompt) > prompt_budget:
        marker = list(truncation_marker_ids)
        # Keep at least one prompt token and constrain the marker if it is unusually long.
        marker = marker[: max(0, min(len(marker), prompt_budget - 1))]
        context_budget = prompt_budget - len(marker)
        head_count = (context_budget + 1) // 2
        tail_count = context_budget - head_count
        head = aligned_prompt[:head_count]
        tail = aligned_prompt[-tail_count:] if tail_count else []
        kept_prompt = head + marker + tail
    else:
        kept_prompt = aligned_prompt

    input_ids = kept_prompt + target_ids
    labels = ([-100] * len(kept_prompt)) + target_ids

    if len(input_ids) > max_length:
        raise AssertionError("Tokenization helper exceeded max_length.")
    if input_ids[-len(target_ids):] != target_ids:
        raise AssertionError("Assistant target tokens were changed or truncated.")
    if labels[-len(target_ids):] != target_ids:
        raise AssertionError("Assistant target labels were masked or truncated.")
    if any(label != -100 for label in labels[:-len(target_ids)]):
        raise AssertionError("Prompt tokens must not contribute to causal-LM loss.")

    return input_ids, labels
