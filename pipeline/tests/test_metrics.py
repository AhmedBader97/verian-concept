"""Ranking metrics (mirrors the "metrics" block of src/engine/engine.test.ts)."""

from __future__ import annotations

import pytest

from pipeline.engine import mean, ndcg_at, percentile, precision_at, recall_at, reciprocal_rank

RELEVANT = {"a": 2, "b": 1}


def test_computes_recall_precision_and_reciprocal_rank() -> None:
    assert recall_at(["x", "a", "y"], RELEVANT, 5) == 0.5
    assert precision_at(["a", "b", "x", "y", "z"], RELEVANT, 5) == 0.4
    assert reciprocal_rank(["x", "b"], RELEVANT) == 0.5


def test_ndcg_is_one_for_the_ideal_ranking() -> None:
    assert ndcg_at(["a", "b"], RELEVANT, 10) == pytest.approx(1, abs=5e-13)
    assert ndcg_at(["b", "a"], RELEVANT, 10) < 1


def test_ndcg_uses_graded_gain_and_log_discount() -> None:
    # dcg = (2^1 - 1)/log2(2) + (2^2 - 1)/log2(3); ideal = 3/log2(2) + 1/log2(3)
    expected = (1 + 3 / 1.584962500721156) / (3 + 1 / 1.584962500721156)
    assert ndcg_at(["b", "a"], RELEVANT, 10) == pytest.approx(expected, rel=1e-15)
    assert ndcg_at(["x", "a"], RELEVANT, 1) == 0


def test_precision_divides_by_k_even_for_short_rankings() -> None:
    assert precision_at(["a"], RELEVANT, 5) == 0.2


def test_empty_inputs_score_zero() -> None:
    assert recall_at(["a"], {}, 5) == 0
    assert precision_at([], RELEVANT, 5) == 0
    assert reciprocal_rank([], RELEVANT) == 0
    assert ndcg_at(["a"], {}, 10) == 0
    assert mean([]) == 0
    assert percentile([], 50) == 0


def test_percentile_uses_the_nearest_rank() -> None:
    xs = [5.0, 1.0, 3.0, 2.0, 4.0]
    assert [percentile(xs, p) for p in (0, 20, 50, 95, 100)] == [1.0, 1.0, 3.0, 5.0, 5.0]


def test_mean_sums_left_to_right_like_javascript() -> None:
    # math.fsum would give 0.6 exactly; JavaScript's reduce gives 0.6000000000000001.
    assert mean([0.1, 0.2, 0.3]) == (0.1 + 0.2 + 0.3) / 3
