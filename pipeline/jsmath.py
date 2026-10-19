"""Bit-exact ports of V8's ``Math.log`` and ``Math.log2``.

Why this module exists
----------------------
The TypeScript engine runs in browsers and Node, where ``Math.log`` and
``Math.log2`` are V8's ports of FreeBSD msun / Sun fdlibm (``src/base/ieee754.cc``).
CPython's :func:`math.log` calls the platform C library instead (glibc on
Linux), which is correctly rounded more often. The two disagree by one unit in
the last place on roughly 7% of the arguments BM25's idf produces, which is
enough to reorder near-tied results and break "same ranking, same bits".

Porting the algorithm is simpler than tolerating the difference: every step
below is an IEEE-754 double operation that Python performs exactly as C does
on x86-64 and ARM64 (V8 is built without floating-point contraction, so there
are no fused multiply-adds to mimic).

The functions are only used where the TypeScript engine calls ``Math.log``
(BM25 idf) and ``Math.log2`` (the nDCG discount).
"""

from __future__ import annotations

import math
import struct

__all__ = ["js_log", "js_log2"]

_TWO54 = 1.80143985094819840000e16  # 0x43500000 00000000
_LN2_HI = 6.93147180369123816490e-01  # 0x3fe62e42 fee00000
_LN2_LO = 1.90821492927058770002e-10  # 0x3dea39ef 35793c76
_IVLN2_HI = 1.44269504072144627571e00  # 0x3ff71547 65200000
_IVLN2_LO = 1.67517131648865118353e-10  # 0x3de705fc 2eefa200

# Remez coefficients of the log(1 + f) approximation on [0, 0.1716].
_LG1 = 6.666666666666735130e-01  # 3FE55555 55555593
_LG2 = 3.999999999940941908e-01  # 3FD99999 9997FA04
_LG3 = 2.857142874366239149e-01  # 3FD24924 94229359
_LG4 = 2.222219843214978396e-01  # 3FCC71C5 1D8E78AF
_LG5 = 1.818357216161805012e-01  # 3FC74664 96CB03DE
_LG6 = 1.531383769920937332e-01  # 3FC39A09 D078C69F
_LG7 = 1.479819860511658591e-01  # 3FC2F112 DF3E5244


def _words(x: float) -> tuple[int, int]:
    """Return the (signed high, unsigned low) 32-bit words of a double."""
    bits = struct.unpack("<Q", struct.pack("<d", x))[0]
    high = bits >> 32
    if high & 0x80000000:
        high -= 1 << 32
    return high, bits & 0xFFFFFFFF


def _with_high(x: float, high: int) -> float:
    """Replace the high 32-bit word of ``x`` (fdlibm's SET_HIGH_WORD)."""
    bits = struct.unpack("<Q", struct.pack("<d", x))[0]
    bits = ((high & 0xFFFFFFFF) << 32) | (bits & 0xFFFFFFFF)
    return struct.unpack("<d", struct.pack("<Q", bits))[0]


def _with_low(x: float, low: int) -> float:
    """Replace the low 32-bit word of ``x`` (fdlibm's SET_LOW_WORD)."""
    bits = struct.unpack("<Q", struct.pack("<d", x))[0]
    bits = (bits & 0xFFFFFFFF00000000) | (low & 0xFFFFFFFF)
    return struct.unpack("<d", struct.pack("<Q", bits))[0]


def _reduce(x: float) -> tuple[float, int, int, int] | float:
    """Shared argument reduction: write x = 2**k * (1 + f) with sqrt(2)/2 < 1 + f < sqrt(2).

    Returns ``(normalised_x, k, hx, lx)`` or, for special inputs, the final result.
    """
    hx, lx = _words(x)
    k = 0
    if hx < 0x00100000:  # x < 2**-1022: zero, negative or subnormal
        if ((hx & 0x7FFFFFFF) | lx) == 0:
            return -math.inf  # log(+-0) = -inf
        if hx < 0:
            return math.nan  # log(negative) = NaN
        k -= 54
        x *= _TWO54  # scale a subnormal up into the normal range
        hx, _ = _words(x)
    if hx >= 0x7FF00000:
        return x + x  # +inf or NaN
    k += (hx >> 20) - 1023
    hx &= 0x000FFFFF
    i = (hx + 0x95F64) & 0x100000
    x = _with_high(x, hx | (i ^ 0x3FF00000))  # normalise x or x/2
    k += i >> 20
    return x, k, hx, lx


def js_log(x: float) -> float:
    """Natural logarithm, bit-identical to V8's ``Math.log`` (fdlibm ``__ieee754_log``)."""
    x = float(x)
    reduced = _reduce(x)
    if isinstance(reduced, float):
        return reduced
    x, k, hx, _ = reduced
    f = x - 1.0
    if (0x000FFFFF & (2 + hx)) < 3:  # -2**-20 <= f < 2**-20
        if f == 0.0:
            if k == 0:
                return 0.0
            dk = float(k)
            return dk * _LN2_HI + dk * _LN2_LO
        r = f * f * (0.5 - 0.33333333333333333 * f)
        if k == 0:
            return f - r
        dk = float(k)
        return dk * _LN2_HI - ((r - dk * _LN2_LO) - f)
    s = f / (2.0 + f)
    dk = float(k)
    z = s * s
    i = hx - 0x6147A
    w = z * z
    j = 0x6B851 - hx
    t1 = w * (_LG2 + w * (_LG4 + w * _LG6))
    t2 = z * (_LG1 + w * (_LG3 + w * (_LG5 + w * _LG7)))
    i |= j
    r = t2 + t1
    if i > 0:
        hfsq = 0.5 * f * f
        if k == 0:
            return f - (hfsq - s * (hfsq + r))
        return dk * _LN2_HI - ((hfsq - (s * (hfsq + r) + dk * _LN2_LO)) - f)
    if k == 0:
        return f - s * (f - r)
    return dk * _LN2_HI - ((s * (f - r) - dk * _LN2_LO) - f)


def _k_log1p(f: float) -> float:
    """``log(1 + f) - f`` for 1 + f in [sqrt(2)/2, sqrt(2)] (msun ``k_log1p``)."""
    s = f / (2.0 + f)
    z = s * s
    w = z * z
    t1 = w * (_LG2 + w * (_LG4 + w * _LG6))
    t2 = z * (_LG1 + w * (_LG3 + w * (_LG5 + w * _LG7)))
    r = t2 + t1
    hfsq = 0.5 * f * f
    return s * (hfsq + r)


def js_log2(x: float) -> float:
    """Base-2 logarithm, bit-identical to V8's ``Math.log2`` (msun ``e_log2.c``)."""
    x = float(x)
    if x == 1.0:
        return 0.0
    reduced = _reduce(x)
    if isinstance(reduced, float):
        return reduced
    x, k, _, _ = reduced
    y = float(k)
    f = x - 1.0
    hfsq = 0.5 * f * f
    r = _k_log1p(f)
    # f - hfsq is split into hi + lo in extra precision (Dekker), as in msun.
    hi = _with_low(f - hfsq, 0)
    lo = (f - hi) - hfsq + r
    val_hi = hi * _IVLN2_HI
    val_lo = (lo + hi) * _IVLN2_LO + lo * _IVLN2_HI
    w = y + val_hi
    val_lo += (y - w) + val_hi
    val_hi = w
    return val_lo + val_hi
