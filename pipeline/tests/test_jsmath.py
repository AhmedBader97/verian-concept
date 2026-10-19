"""The V8 ports of Math.log and Math.log2.

The expected values were produced by Node 22 (V8 12.4); where V8 and the C
library disagree in the last bit, the port must give V8's answer.
"""

from __future__ import annotations

import math
import random

import pytest

from pipeline.jsmath import js_log, js_log2

# (x, Math.log(x) in V8) for arguments where glibc's log differs by one ulp.
V8_LOG = [
    (3.0, "0x1.193ea7aad030ap+0"),
    (48.0, "0x1.ef8383c50bb74p+1"),
    (1.6, "0x1.e148a1a2726cep-2"),
    (2.666666666666667, "0x1.f62f40794a7bap-1"),
    (1.0909090909090908, "0x1.64660aa8ce620p-4"),
]


@pytest.mark.parametrize(("x", "expected"), V8_LOG)
def test_log_matches_v8_bit_for_bit(x: float, expected: str) -> None:
    assert js_log(x) == float.fromhex(expected)


def test_special_values_follow_ieee_754() -> None:
    assert js_log(1.0) == 0.0
    assert js_log(0.0) == -math.inf
    assert math.isnan(js_log(-1.0))
    assert js_log(math.inf) == math.inf
    assert js_log2(8.0) == 3.0
    assert js_log2(1.0) == 0.0
    assert js_log2(5e-324) == -1074.0


def test_agrees_with_libm_to_within_one_ulp() -> None:
    rng = random.Random(7)
    for _ in range(2000):
        x = math.exp(rng.uniform(-700, 700))
        assert abs(js_log(x) - math.log(x)) <= math.ulp(math.log(x))
        assert abs(js_log2(x) - math.log2(x)) <= math.ulp(math.log2(x))
