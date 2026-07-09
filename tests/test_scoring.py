"""スコアリング純粋関数のユニットテスト。"""

import pytest

from app import scoring


class TestBands:
    def test_age_band(self):
        assert scoring.age_band(0) == "00-05"
        assert scoring.age_band(5) == "00-05"
        assert scoring.age_band(6) == "06-10"
        assert scoring.age_band(15) == "11-15"
        assert scoring.age_band(30) == "21-30"
        assert scoring.age_band(31) == "31+"
        assert scoring.age_band(80) == "31+"
        assert scoring.age_band(None) is None

    def test_age_band_negative_clamped(self):
        # 竣工前（新築販売中）は 0 に丸める
        assert scoring.age_band(-1) == "00-05"

    def test_size_band(self):
        assert scoring.size_band(30) == "0-40"
        assert scoring.size_band(40) == "40-60"
        assert scoring.size_band(59.9) == "40-60"
        assert scoring.size_band(60) == "60-80"
        assert scoring.size_band(99.9) == "80-100"
        assert scoring.size_band(150) == "100+"


class TestDeviation:
    def test_cheaper_is_negative(self):
        assert scoring.deviation_pct(80, 100) == pytest.approx(-20.0)

    def test_expensive_is_positive(self):
        assert scoring.deviation_pct(120, 100) == pytest.approx(20.0)

    def test_equal_is_zero(self):
        assert scoring.deviation_pct(100, 100) == 0.0

    def test_zero_reference_raises(self):
        with pytest.raises(ValueError):
            scoring.deviation_pct(100, 0)


class TestCompositeScore:
    def test_at_market_price_is_50(self):
        assert scoring.composite_score(0.0, None) == 50.0

    def test_20pct_cheap_is_100(self):
        assert scoring.composite_score(-20.0, None) == 100.0

    def test_20pct_expensive_is_0(self):
        assert scoring.composite_score(20.0, None) == 0.0

    def test_clamped_to_0_100(self):
        assert scoring.composite_score(-90.0, None) == 100.0
        assert scoring.composite_score(90.0, None) == 0.0

    def test_trend_blended_70_30(self):
        # 相場乖離 -20% (100点) + トレンド乖離 0% (50点) → 0.7*100 + 0.3*50 = 85
        assert scoring.composite_score(-20.0, 0.0) == 85.0

    def test_without_trend_uses_market_only(self):
        assert scoring.composite_score(-10.0, None) == 75.0


class TestConfidence:
    def test_high_needs_district_level_and_samples(self):
        assert scoring.confidence(25, 0) == "high"
        assert scoring.confidence(25, 1) == "high"

    def test_medium(self):
        assert scoring.confidence(10, 2) == "medium"
        assert scoring.confidence(19, 1) == "medium"

    def test_low_when_few_samples_or_deep_fallback(self):
        assert scoring.confidence(7, 0) == "low"
        assert scoring.confidence(100, 4) == "low"


class TestOutlier:
    def test_extreme_cheap_flagged(self):
        flagged, reason = scoring.outlier_check(-40.0)
        assert flagged
        assert "安値" in reason

    def test_extreme_expensive_flagged(self):
        flagged, reason = scoring.outlier_check(70.0)
        assert flagged
        assert "高値" in reason

    def test_normal_not_flagged(self):
        assert scoring.outlier_check(-20.0) == (False, None)
        assert scoring.outlier_check(30.0) == (False, None)


class TestTrendAdjustedExpected:
    def test_rising_market_raises_expected(self):
        # 傾き 10/四半期、窓平均 t=6、現在 t=12 → 補正比 = 160/100 = 1.6
        expected = scoring.trend_adjusted_expected(
            group_median=500_000, slope=10, intercept=40, t_now=12, t_mean=6
        )
        assert expected == pytest.approx(500_000 * 1.6)

    def test_flat_market_unchanged(self):
        expected = scoring.trend_adjusted_expected(
            group_median=500_000, slope=0, intercept=100, t_now=12, t_mean=6
        )
        assert expected == pytest.approx(500_000)

    def test_nonpositive_fit_returns_none(self):
        assert scoring.trend_adjusted_expected(
            group_median=500_000, slope=-100, intercept=50, t_now=12, t_mean=6
        ) is None


class TestGrossYield:
    def test_rent_listing_yield(self):
        # 月20万・50㎡、売買相場80万/㎡ → 240万 / 4000万 = 6%
        y = scoring.gross_yield_pct(
            monthly_rent=200_000, area_sqm=50, sale_unit_median=800_000
        )
        assert y == pytest.approx(6.0)

    def test_sale_listing_yield(self):
        # 4000万・50㎡、賃料相場4000円/㎡月 → 240万/年 / 4000万 = 6%
        y = scoring.gross_yield_pct(
            sale_price=40_000_000, area_sqm=50, rent_unit_median=4_000
        )
        assert y == pytest.approx(6.0)

    def test_missing_market_returns_none(self):
        assert scoring.gross_yield_pct(monthly_rent=200_000, area_sqm=50) is None


class TestOls:
    def test_perfect_line(self):
        points = [(float(t), 100.0 + 5.0 * t) for t in range(10)]
        r = scoring.ols(points)
        assert r.slope == pytest.approx(5.0)
        assert r.intercept == pytest.approx(100.0)
        assert r.r2 == pytest.approx(1.0)
        assert r.t_mean == pytest.approx(4.5)

    def test_too_few_points(self):
        assert scoring.ols([(0.0, 1.0)]) is None

    def test_vertical_points(self):
        assert scoring.ols([(1.0, 1.0), (1.0, 2.0)]) is None
