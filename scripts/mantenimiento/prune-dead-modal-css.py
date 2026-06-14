#!/usr/bin/env python3
"""Remove CSS rule blocks/selectors for validated-dead modal classes."""

from __future__ import annotations

import re
import sys
from pathlib import Path

DEAD_CLASSES = [
    'tx-close-minimal',
    'budget-market-strip',
    'budget-market-chip',
    'budget-insights-panel',
    'budget-insights-head',
    'budget-kpi-grid',
    'budget-kpi-card',
    'budget-kpi-label',
    'budget-health-head',
    'budget-health-track',
    'budget-health-fill',
    'budget-health-legend',
    'budget-health',
    'budget-guidance-list',
    'budget-guidance-head',
    'budget-guidance-item',
    'budget-summary-strip',
    'budget-summary-chip',
    'budget-summary-panel',
    'budget-top-expenses',
    'budget-top-meta',
    'budget-top-row',
    'budget-quick-actions',
    'budget-carousel-arrow',
    'budget-swipe-metric',
    'budget-agent-actions',
    'budget-card-snapshot',
    'bcc-hero-log',
    'bcc-log-row',
    'bcc-log-q',
    'bcc-log-a',
    'bcc-hero-transcript',
    'bcc-transcript-row',
    'bcc-transcript-label',
    'bcc-transcript-text',
    'interview-report-shell',
]

CLASS_PATTERN = {
    cls: re.compile(rf'\.{re.escape(cls)}(?![a-z0-9_-])')
    for cls in DEAD_CLASSES
}


def selector_is_dead(selector: str) -> bool:
    selector = selector.strip()
    if not selector:
        return True
    return any(pattern.search(selector) for pattern in CLASS_PATTERN.values())


def split_selectors(selector_text: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    depth = 0
    for char in selector_text:
        if char == '(':
            depth += 1
        elif char == ')':
            depth = max(0, depth - 1)
        if char == ',' and depth == 0:
            parts.append(''.join(current).strip())
            current = []
            continue
        current.append(char)
    tail = ''.join(current).strip()
    if tail:
        parts.append(tail)
    return parts


def filter_rule_selector(selector_text: str) -> str | None:
    kept = [part for part in split_selectors(selector_text) if not selector_is_dead(part)]
    if not kept:
        return None
    return ',\n'.join(kept)


def strip_comments(text: str) -> str:
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return text


def prune_css(text: str) -> tuple[str, int]:
    removed_blocks = 0
    output: list[str] = []
    i = 0
    n = len(text)

    while i < n:
        if text.startswith('/*', i):
            end = text.find('*/', i + 2)
            if end == -1:
                output.append(text[i:])
                break
            output.append(text[i : end + 2])
            i = end + 2
            continue

        if text[i] in ' \t\r\n':
            output.append(text[i])
            i += 1
            continue

        if text[i] == '@':
            end = i + 1
            while end < n and text[end] not in '{;':
                end += 1
            if end >= n:
                output.append(text[i:])
                break
            if text[end] == ';':
                output.append(text[i : end + 1])
                i = end + 1
                continue
            block, next_i, removed = parse_block(text, end)
            pruned_inner, inner_removed = prune_css(block)
            removed_blocks += removed + inner_removed
            inner_clean = strip_comments(pruned_inner).strip()
            if inner_clean:
                output.append(text[i:end + 1])
                output.append(pruned_inner)
                output.append('}')
            else:
                removed_blocks += 1
            i = next_i + 1
            continue

        selector_start = i
        brace = text.find('{', i)
        if brace == -1:
            output.append(text[i:])
            break
        selector_text = text[selector_start:brace]
        block, next_i, _ = parse_block(text, brace)
        filtered = filter_rule_selector(selector_text)
        if filtered is None:
            removed_blocks += 1
        else:
            if filtered != selector_text.strip():
                removed_blocks += 1
            output.append(filtered)
            output.append('{')
            output.append(block)
            output.append('}')
        i = next_i + 1

    cleaned = re.sub(r'\n{3,}', '\n\n', ''.join(output))
    return cleaned, removed_blocks


def parse_block(text: str, brace_index: int) -> tuple[str, int, int]:
    depth = 0
    i = brace_index
    n = len(text)
    while i < n:
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return text[brace_index + 1 : i], i, 0
        i += 1
    return text[brace_index + 1 :], n - 1, 0


def main() -> int:
    root = Path(__file__).resolve().parents[1] / 'apps' / 'web' / 'app' / 'estilos'
    files = [
        root / 'modales' / 'diagnostico' / 'agent-modals-diagnostics.css',
        root / 'modales' / 'presupuesto' / 'agent-modals-budget.css',
        root / 'modales' / 'transacciones' / 'agent-modals-transactions.css',
        root / 'modales' / 'transacciones' / 'agent-modals-transactions-contract.css',
        root / 'modales' / 'comunes' / 'agent-modals-safe-area.css',
        root / 'modales' / 'presupuesto' / 'agent-modals-budget-desktop-guard.css',
        root / 'sistema' / 'backdrop-system.css',
    ]

    total_removed = 0
    for path in files:
        if not path.exists():
            print(f'skip missing {path}')
            continue
        original = path.read_text()
        pruned, removed = prune_css(original)
        if pruned != original:
            path.write_text(pruned)
            print(f'{path.name}: pruned ~{removed} rule(s)/selector(s)')
            total_removed += removed
        else:
            print(f'{path.name}: no changes')

    print(f'total: ~{total_removed} removals')
    return 0


if __name__ == '__main__':
    sys.exit(main())
