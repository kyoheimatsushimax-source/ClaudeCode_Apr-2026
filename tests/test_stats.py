"""エリア統計・フォールバック・スコア一括計算の統合テスト（インメモリDB）。"""

import pytest

from app import stats
from app.db import get_conn, init_db
from app.mlit import insert_transactions


def make_tx(district="豊洲", unit_price=1_000_000, age=10, area=65.0,
            year=2024, quarter=1, muni="江東区", **kw):
    price = int(unit_price * area)
    row = {
        "price_category": "成約価格情報",
        "type": "中古マンション等",
        "muni_code": "13108",
        "prefecture": "東京都",
        "municipality": muni,
        "district": district,
        "price": price,
        "area_sqm": area,
        "unit_price": price / area,
        "floor_plan": "2LDK",
        "building_year": year - age,
        "age_at_trade": age,
        "structure": "ＲＣ",
        "period_year": year,
        "period_quarter": quarter,
        "raw_json": None,
    }
    row.update(kw)
    return row


@pytest.fixture
def conn():
    conn = get_conn(":memory:")
    init_db(conn)
    yield conn
    conn.close()


def add_listing(conn, source_id="L1", listing_type="sale", price=60_000_000,
                area=65.0, building_year=2014, district="豊洲",
                muni="江東区", lat=35.65, lng=139.79):
    conn.execute(
        """INSERT INTO listings
           (source, source_id, listing_type, title, price, area_sqm,
            unit_price, building_year, prefecture, municipality, district,
            lat, lng, active, imported_at)
           VALUES ('test', ?, ?, ?, ?, ?, ?, ?, '東京都', ?, ?, ?, ?, 1, '')""",
        (source_id, listing_type, source_id, price, area, price / area,
         building_year, muni, district, lat, lng),
    )
    conn.commit()


class TestAreaStats:
    def test_median_at_district_level(self, conn):
        # 同一グループ（豊洲×築06-10×60-80㎡）に単価 90,100,110万 の3件
        rows = [make_tx(unit_price=p, age=8, area=65, quarter=q + 1)
                for q, p in enumerate([900_000, 1_000_000, 1_100_000])]
        insert_transactions(conn, rows)
        stats.compute_area_stats(conn, log=lambda *_: None)
        row = conn.execute(
            """SELECT * FROM area_stats WHERE level = 0 AND district = '豊洲'
               AND age_band = '06-10' AND size_band = '60-80'"""
        ).fetchone()
        assert row["median_unit_price"] == pytest.approx(1_000_000)
        assert row["sample_count"] == 3

    def test_heatmap_level_aggregates_all(self, conn):
        rows = [make_tx(unit_price=1_000_000, age=a, area=s)
                for a, s in [(3, 35), (10, 55), (25, 75)]]
        insert_transactions(conn, rows)
        stats.compute_area_stats(conn, log=lambda *_: None)
        row = conn.execute(
            "SELECT * FROM area_stats WHERE level = ? AND district = '豊洲'",
            (stats.HEATMAP_LEVEL,),
        ).fetchone()
        assert row["sample_count"] == 3


class TestFallback:
    def test_uses_district_group_when_enough_samples(self, conn):
        rows = [make_tx(unit_price=1_000_000 + i * 1000, age=8, area=65,
                        quarter=(i % 4) + 1) for i in range(6)]
        insert_transactions(conn, rows)
        stats.compute_area_stats(conn, log=lambda *_: None)
        stat, level = stats.lookup_market_stat(
            conn, "sale", "東京都", "江東区", "豊洲", "06-10", "60-80")
        assert level == 0
        assert stat["sample_count"] == 6

    def test_falls_back_when_district_group_sparse(self, conn):
        # 地区×築×広さ には2件しかないが、市区町村全体では十分ある
        rows = [make_tx(unit_price=1_000_000, age=8, area=65, quarter=(i % 4) + 1)
                for i in range(2)]
        rows += [make_tx(district="東雲", unit_price=800_000, age=20, area=45,
                         quarter=(i % 4) + 1) for i in range(10)]
        insert_transactions(conn, rows)
        stats.compute_area_stats(conn, log=lambda *_: None)
        stat, level = stats.lookup_market_stat(
            conn, "sale", "東京都", "江東区", "豊洲", "06-10", "60-80")
        assert level > 0
        assert stat is not None

    def test_no_stats_returns_none(self, conn):
        stats.compute_area_stats(conn, log=lambda *_: None)
        stat, level = stats.lookup_market_stat(
            conn, "sale", "東京都", "存在しない市", None, "06-10", "60-80")
        assert stat is None and level is None


class TestTrend:
    def test_rising_trend_detected(self, conn):
        # 12四半期で単価が毎四半期 +10,000円 上昇（各四半期5件）
        rows = []
        for t in range(12):
            year, q = 2022 + t // 4, t % 4 + 1
            for i in range(5):
                rows.append(make_tx(
                    unit_price=1_000_000 + t * 10_000 + i * 1000,
                    age=8 + i, area=60 + i, year=year, quarter=q))
        insert_transactions(conn, rows)
        stats.compute_area_stats(conn, log=lambda *_: None)
        trend = conn.execute(
            "SELECT * FROM trend_stats WHERE municipality = '江東区'"
        ).fetchone()
        assert trend is not None
        assert trend["slope"] == pytest.approx(10_000, rel=0.15)
        assert trend["n"] == 12

    def test_insufficient_quarters_no_trend(self, conn):
        rows = [make_tx(quarter=q) for q in (1, 2, 3)]
        insert_transactions(conn, rows)
        stats.compute_area_stats(conn, log=lambda *_: None)
        assert conn.execute("SELECT COUNT(*) FROM trend_stats").fetchone()[0] == 0


class TestScoreAll:
    def _seed_market(self, conn, unit_price=1_000_000):
        rows = [make_tx(unit_price=unit_price + i * 1000, age=8 + (i % 3),
                        area=60 + i, quarter=(i % 4) + 1, year=2024)
                for i in range(12)]
        insert_transactions(conn, rows)
        stats.compute_area_stats(conn, now_year=2025, log=lambda *_: None)

    def test_cheap_listing_scores_high(self, conn):
        self._seed_market(conn)
        # 相場約100万/㎡ に対し 80万/㎡ → 約 -20% → スコア高
        add_listing(conn, price=int(800_000 * 65), area=65, building_year=2016)
        stats.score_all_listings(conn, now_year=2025, now_quarter=1,
                                 log=lambda *_: None)
        s = conn.execute("SELECT * FROM scores").fetchone()
        assert s["market_deviation_pct"] == pytest.approx(-20, abs=2)
        assert s["score"] > 80
        assert s["outlier"] == 0

    def test_extreme_cheap_flagged_outlier(self, conn):
        self._seed_market(conn)
        add_listing(conn, price=int(500_000 * 65), area=65, building_year=2016)
        stats.score_all_listings(conn, now_year=2025, now_quarter=1,
                                 log=lambda *_: None)
        s = conn.execute("SELECT * FROM scores").fetchone()
        assert s["outlier"] == 1
        assert s["outlier_reason"]

    def test_listing_without_area_info_skipped(self, conn):
        self._seed_market(conn)
        conn.execute(
            """INSERT INTO listings (source, source_id, listing_type, price,
               area_sqm, unit_price, active, imported_at)
               VALUES ('test', 'X', 'sale', 50000000, 60, 833333, 1, '')"""
        )
        conn.commit()
        n = stats.score_all_listings(conn, now_year=2025, now_quarter=1,
                                     log=lambda *_: None)
        assert n == 0

    def test_rent_scoring_uses_rent_basis(self, conn):
        # 賃貸相場は掲載賃貸から作られる: 4件 + 対象1件
        for i in range(4):
            add_listing(conn, source_id=f"R{i}", listing_type="rent",
                        price=200_000 + i * 2000, area=50, building_year=2015)
        add_listing(conn, source_id="R_cheap", listing_type="rent",
                    price=160_000, area=50, building_year=2015)
        stats.compute_area_stats(conn, now_year=2025, log=lambda *_: None)
        stats.score_all_listings(conn, now_year=2025, now_quarter=1,
                                 log=lambda *_: None)
        s = conn.execute(
            """SELECT s.* FROM scores s JOIN listings l ON l.id = s.listing_id
               WHERE l.source_id = 'R_cheap'"""
        ).fetchone()
        assert s is not None
        assert s["market_deviation_pct"] < -10
        assert s["score"] > 70

    def test_yield_computed_when_both_markets_exist(self, conn):
        self._seed_market(conn)  # 売買相場 約100万/㎡
        for i in range(5):
            add_listing(conn, source_id=f"R{i}", listing_type="rent",
                        price=250_000 + i * 1000, area=50, building_year=2016)
        stats.compute_area_stats(conn, now_year=2025, log=lambda *_: None)
        stats.score_all_listings(conn, now_year=2025, now_quarter=1,
                                 log=lambda *_: None)
        s = conn.execute(
            """SELECT s.* FROM scores s JOIN listings l ON l.id = s.listing_id
               WHERE l.source_id = 'R0'"""
        ).fetchone()
        # 月25万×12 / (100万/㎡×50㎡) ≈ 6%
        assert s["gross_yield_pct"] == pytest.approx(6.0, abs=1.0)
