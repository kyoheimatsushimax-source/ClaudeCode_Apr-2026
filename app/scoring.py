"""割安スコアリングの純粋関数群（ユニットテスト対象のコアロジック）。

指標:
1. 相場乖離率: 同一エリア×築年帯×広さ帯の成約㎡単価中央値に対する乖離(%)。
   マイナス = 相場より安い。
2. トレンド乖離率: 過去3年の㎡単価回帰トレンドで相場中央値を現在時点に
   補正した理論価格に対する乖離(%)。
合成スコアは 0-100（高いほど割安）。
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

# 築年帯（上限を含む）
AGE_BANDS = [(0, 5), (6, 10), (11, 15), (16, 20), (21, 30), (31, 999)]
# 広さ帯（㎡、下限以上・上限未満）
SIZE_BANDS = [(0, 40), (40, 60), (60, 80), (80, 100), (100, 100000)]

# 乖離率 → スコアの傾き（乖離 -20% で満点 100、+20% で 0 になる係数）
_SCORE_SLOPE = 2.5
# 合成の重み
W_MARKET = 0.7
W_TREND = 0.3

# 外れ値フラグの閾値（借地権・事故物件・入力ミス等の可能性）
OUTLIER_CHEAP_PCT = -35.0
OUTLIER_EXPENSIVE_PCT = 60.0


def age_band(age: int | None) -> str | None:
    """築年数 → 築年帯ラベル（例: '06-10'）。不明は None。"""
    if age is None:
        return None
    age = max(0, age)
    for lo, hi in AGE_BANDS:
        if lo <= age <= hi:
            return f"{lo:02d}-{hi:02d}" if hi < 999 else f"{lo:02d}+"
    return None


def size_band(sqm: float) -> str:
    """専有面積 → 広さ帯ラベル（例: '40-60'）。"""
    for lo, hi in SIZE_BANDS:
        if lo <= sqm < hi:
            return f"{lo}-{hi}" if hi < 100000 else f"{lo}+"
    return f"{SIZE_BANDS[-1][0]}+"


def median(values: list[float]) -> float:
    return statistics.median(values)


def deviation_pct(unit_price: float, reference: float) -> float:
    """基準単価に対する乖離率(%)。マイナス = 安い。"""
    if reference <= 0:
        raise ValueError("reference must be positive")
    return (unit_price - reference) / reference * 100.0


def trend_adjusted_expected(
    group_median: float,
    slope: float,
    intercept: float,
    t_now: float,
    t_mean: float,
) -> float | None:
    """相場中央値をトレンドで現在時点に補正した理論単価。

    回帰は市区町村レベルの四半期中央値に対して行うため、そのまま物件と
    比較すると物件構成（築年・広さ）の偏りが混入する。そこで
    「窓平均時点の回帰値 → 現在時点の回帰値」の比率だけを取り出して
    グループ中央値に掛ける。回帰値が非正になる場合は None。
    """
    fitted_mean = slope * t_mean + intercept
    fitted_now = slope * t_now + intercept
    if fitted_mean <= 0 or fitted_now <= 0:
        return None
    return group_median * (fitted_now / fitted_mean)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def composite_score(
    market_dev_pct: float,
    trend_dev_pct: float | None,
) -> float:
    """相場乖離とトレンド乖離を合成した 0-100 スコア。

    乖離 0% = 50 点、-20%（2割安）= 100 点、+20% = 0 点。
    トレンド乖離が無ければ相場乖離のみで算出する。
    """
    s_market = _clamp(50.0 - market_dev_pct * _SCORE_SLOPE)
    if trend_dev_pct is None:
        return round(s_market, 1)
    s_trend = _clamp(50.0 - trend_dev_pct * _SCORE_SLOPE)
    return round(W_MARKET * s_market + W_TREND * s_trend, 1)


def confidence(sample_count: int, fallback_level: int) -> str:
    """相場統計の信頼度。サンプル数とフォールバック段数から判定。"""
    if fallback_level <= 1 and sample_count >= 20:
        return "high"
    if fallback_level <= 3 and sample_count >= 8:
        return "medium"
    return "low"


def outlier_check(market_dev_pct: float) -> tuple[bool, str | None]:
    """極端な乖離をフラグ付け（借地権・事故物件・入力ミス等の可能性）。"""
    if market_dev_pct <= OUTLIER_CHEAP_PCT:
        return True, (f"相場比 {market_dev_pct:.0f}% は極端に安値です。"
                      "借地権・事故物件・要修繕・入力ミス等の可能性があります")
    if market_dev_pct >= OUTLIER_EXPENSIVE_PCT:
        return True, f"相場比 +{market_dev_pct:.0f}% は極端に高値です"
    return False, None


def gross_yield_pct(
    monthly_rent: float | None = None,
    sale_price: float | None = None,
    area_sqm: float | None = None,
    rent_unit_median: float | None = None,
    sale_unit_median: float | None = None,
) -> float | None:
    """想定表面利回り(%/年) の参考値。

    - 賃貸物件: 自身の月額賃料 ÷ (エリア売買相場㎡単価 × 面積)
    - 売買物件: (エリア賃料相場㎡単価 × 面積 × 12ヶ月) ÷ 自身の価格
    計算に必要な相場が無ければ None。
    """
    if monthly_rent is not None and sale_unit_median and area_sqm:
        price = sale_unit_median * area_sqm
        return round(monthly_rent * 12 / price * 100, 2)
    if sale_price is not None and rent_unit_median and area_sqm:
        return round(rent_unit_median * area_sqm * 12 / sale_price * 100, 2)
    return None


@dataclass
class OlsResult:
    slope: float
    intercept: float
    n: int
    r2: float
    t_mean: float


def ols(points: list[tuple[float, float]]) -> OlsResult | None:
    """(t, y) 点列への最小二乗直線。点が2未満、または t が全て同一なら None。"""
    n = len(points)
    if n < 2:
        return None
    ts = [p[0] for p in points]
    ys = [p[1] for p in points]
    t_mean = sum(ts) / n
    y_mean = sum(ys) / n
    sxx = sum((t - t_mean) ** 2 for t in ts)
    if sxx == 0:
        return None
    sxy = sum((t - t_mean) * (y - y_mean) for t, y in points)
    slope = sxy / sxx
    intercept = y_mean - slope * t_mean
    ss_tot = sum((y - y_mean) ** 2 for y in ys)
    ss_res = sum((y - (slope * t + intercept)) ** 2 for t, y in points)
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
    return OlsResult(slope=slope, intercept=intercept, n=n, r2=r2, t_mean=t_mean)
