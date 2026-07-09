"""エリア統計・トレンド回帰の事前計算と、物件スコアの一括算出バッチ。"""

from __future__ import annotations

import datetime
import statistics

from . import config, scoring

# フォールバックレベル定義:
#   0: 地区×築年帯×広さ帯 / 1: 地区×広さ帯 / 2: 市区町村×築年帯×広さ帯
#   3: 市区町村×広さ帯    / 4: 市区町村全体
_LEVELS = [
    (0, True, True, True),    # (level, use_district, use_age, use_size)
    (1, True, False, True),
    (2, False, True, True),
    (3, False, False, True),
    (4, False, False, False),
]
# レベル5（地区全体）はヒートマップ表示専用で、スコアのフォールバックには使わない
HEATMAP_LEVEL = 5
_GEN_LEVELS = _LEVELS + [(HEATMAP_LEVEL, True, False, False)]


def _stat_rows(samples: list[dict], basis: str):
    """サンプル群を各レベルで集計して area_stats 行を生成する。"""
    for level, use_district, use_age, use_size in _GEN_LEVELS:
        groups: dict[tuple, list[float]] = {}
        for s in samples:
            district = s["district"] if use_district else None
            age_b = s["age_band"] if use_age else None
            size_b = s["size_band"] if use_size else None
            if use_district and not district:
                continue
            if use_age and not age_b:
                continue
            key = (s["prefecture"], s["municipality"], district, age_b, size_b)
            groups.setdefault(key, []).append(s["unit_price"])
        for key, values in groups.items():
            yield (basis, level, *key,
                   statistics.median(values),
                   sum(values) / len(values),
                   len(values))


def _tx_samples(conn, window_quarters: int) -> list[dict]:
    """統計対象の成約サンプル（直近 window_quarters 分）。"""
    latest = conn.execute(
        "SELECT MAX(period_year * 4 + period_quarter) AS t FROM transactions"
    ).fetchone()["t"]
    if latest is None:
        return []
    t_from = latest - window_quarters + 1
    rows = conn.execute(
        """SELECT prefecture, municipality, district, unit_price,
                  age_at_trade, area_sqm
           FROM transactions
           WHERE period_year * 4 + period_quarter >= ?""",
        (t_from,),
    ).fetchall()
    return [
        {
            "prefecture": r["prefecture"],
            "municipality": r["municipality"],
            "district": r["district"],
            "unit_price": r["unit_price"],
            "age_band": scoring.age_band(r["age_at_trade"]),
            "size_band": scoring.size_band(r["area_sqm"]),
        }
        for r in rows
    ]


def _rent_samples(conn, now_year: int) -> list[dict]:
    """賃貸相場は掲載中の賃貸物件から作る（成約賃料の公的データが無いため）。"""
    rows = conn.execute(
        """SELECT prefecture, municipality, district, unit_price,
                  building_year, area_sqm
           FROM listings WHERE listing_type = 'rent' AND active = 1"""
    ).fetchall()
    return [
        {
            "prefecture": r["prefecture"],
            "municipality": r["municipality"],
            "district": r["district"],
            "unit_price": r["unit_price"],
            "age_band": scoring.age_band(
                now_year - r["building_year"] if r["building_year"] else None
            ),
            "size_band": scoring.size_band(r["area_sqm"]),
        }
        for r in rows
        if r["prefecture"] and r["municipality"]
    ]


def compute_area_stats(conn, now_year: int | None = None, log=print) -> int:
    """area_stats / trend_stats を再計算する。戻り値は area_stats 行数。"""
    now_year = now_year or datetime.date.today().year
    conn.execute("DELETE FROM area_stats")
    conn.execute("DELETE FROM trend_stats")

    count = 0
    tx = _tx_samples(conn, config.TREND_WINDOW_QUARTERS)
    rent = _rent_samples(conn, now_year)
    for basis, samples in (("sale", tx), ("rent", rent)):
        for row in _stat_rows(samples, basis):
            conn.execute(
                """INSERT OR REPLACE INTO area_stats
                   (basis, level, prefecture, municipality, district,
                    age_band, size_band, median_unit_price, mean_unit_price,
                    sample_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                row,
            )
            count += 1
    trends = compute_trend_stats(conn)
    conn.commit()
    log(f"エリア統計 {count} 行 / トレンド回帰 {trends} 市区町村 を計算しました")
    return count


def compute_trend_stats(conn) -> int:
    """市区町村ごとに四半期㎡単価中央値の回帰トレンドを計算する。"""
    latest = conn.execute(
        "SELECT MAX(period_year * 4 + period_quarter) AS t FROM transactions"
    ).fetchone()["t"]
    if latest is None:
        return 0
    t_from = latest - config.TREND_WINDOW_QUARTERS + 1

    rows = conn.execute(
        """SELECT prefecture, municipality,
                  period_year * 4 + period_quarter AS t, unit_price
           FROM transactions
           WHERE period_year * 4 + period_quarter >= ?""",
        (t_from,),
    ).fetchall()

    by_muni: dict[tuple[str, str], dict[int, list[float]]] = {}
    for r in rows:
        by_muni.setdefault((r["prefecture"], r["municipality"]), {}) \
            .setdefault(r["t"], []).append(r["unit_price"])

    n_saved = 0
    for (pref, muni), quarters in by_muni.items():
        points = [(float(t), statistics.median(v)) for t, v in sorted(quarters.items())]
        if len(points) < config.TREND_MIN_POINTS:
            continue
        result = scoring.ols(points)
        if result is None:
            continue
        conn.execute(
            """INSERT OR REPLACE INTO trend_stats
               (basis, prefecture, municipality, slope, intercept, n, r2,
                t_mean, t_latest)
               VALUES ('sale', ?, ?, ?, ?, ?, ?, ?, ?)""",
            (pref, muni, result.slope, result.intercept, result.n,
             result.r2, result.t_mean, latest),
        )
        n_saved += 1
    return n_saved


def lookup_market_stat(
    conn, basis: str, prefecture: str, municipality: str,
    district: str | None, age_b: str | None, size_b: str,
):
    """フォールバック付きで相場統計を引く。(row, level) or (None, None)。"""
    min_samples = (config.MIN_SAMPLES_SALE if basis == "sale"
                   else config.MIN_SAMPLES_RENT)
    for level, use_district, use_age, use_size in _LEVELS:
        d = district if use_district else None
        a = age_b if use_age else None
        s = size_b if use_size else None
        if use_district and not d:
            continue
        if use_age and not a:
            continue
        row = conn.execute(
            """SELECT * FROM area_stats
               WHERE basis = ? AND level = ? AND prefecture = ?
                 AND municipality = ? AND district IS ? AND age_band IS ?
                 AND size_band IS ?""",
            (basis, level, prefecture, municipality, d, a, s),
        ).fetchone()
        if row is None:
            continue
        # 最終レベル(4)はサンプル数を問わず採用（信頼度は low になる）
        if row["sample_count"] >= min_samples or level == _LEVELS[-1][0]:
            return row, level
    return None, None


def score_all_listings(conn, now_year: int | None = None,
                       now_quarter: int | None = None, log=print) -> int:
    """全アクティブ物件のスコアを再計算する。"""
    today = datetime.date.today()
    now_year = now_year or today.year
    now_quarter = now_quarter or (today.month - 1) // 3 + 1
    t_now = now_year * 4 + now_quarter

    conn.execute("DELETE FROM scores")
    listings = conn.execute(
        "SELECT * FROM listings WHERE active = 1"
    ).fetchall()

    computed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    n_scored = 0
    for lst in listings:
        if not lst["prefecture"] or not lst["municipality"]:
            continue
        age = (now_year - lst["building_year"]
               if lst["building_year"] else None)
        age_b = scoring.age_band(age)
        size_b = scoring.size_band(lst["area_sqm"])
        basis = "sale" if lst["listing_type"] == "sale" else "rent"

        stat, level = lookup_market_stat(
            conn, basis, lst["prefecture"], lst["municipality"],
            lst["district"], age_b, size_b,
        )
        if stat is None:
            continue

        market_median = stat["median_unit_price"]
        market_dev = scoring.deviation_pct(lst["unit_price"], market_median)

        # トレンド補正（成約データがある売買のみ。賃貸は相場乖離のみ）
        trend_expected = None
        trend_dev = None
        if basis == "sale":
            trend = conn.execute(
                """SELECT * FROM trend_stats WHERE basis = 'sale'
                   AND prefecture = ? AND municipality = ?""",
                (lst["prefecture"], lst["municipality"]),
            ).fetchone()
            if trend is not None:
                trend_expected = scoring.trend_adjusted_expected(
                    market_median, trend["slope"], trend["intercept"],
                    float(t_now), trend["t_mean"],
                )
                if trend_expected:
                    trend_dev = scoring.deviation_pct(
                        lst["unit_price"], trend_expected
                    )

        score = scoring.composite_score(market_dev, trend_dev)
        conf = scoring.confidence(stat["sample_count"], level)
        outlier, reason = scoring.outlier_check(market_dev)

        # 想定表面利回り（参考値）: 反対側の相場が引ければ計算
        other_basis = "rent" if basis == "sale" else "sale"
        other_stat, _ = lookup_market_stat(
            conn, other_basis, lst["prefecture"], lst["municipality"],
            lst["district"], age_b, size_b,
        )
        yield_pct = None
        if other_stat is not None:
            if basis == "rent":
                yield_pct = scoring.gross_yield_pct(
                    monthly_rent=lst["price"], area_sqm=lst["area_sqm"],
                    sale_unit_median=other_stat["median_unit_price"],
                )
            else:
                yield_pct = scoring.gross_yield_pct(
                    sale_price=lst["price"], area_sqm=lst["area_sqm"],
                    rent_unit_median=other_stat["median_unit_price"],
                )

        conn.execute(
            """INSERT OR REPLACE INTO scores
               (listing_id, market_median, market_deviation_pct,
                market_sample_count, market_level, trend_expected,
                trend_deviation_pct, score, confidence, outlier,
                outlier_reason, gross_yield_pct, computed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (lst["id"], market_median, market_dev, stat["sample_count"],
             level, trend_expected, trend_dev, score, conf,
             int(outlier), reason, yield_pct, computed_at),
        )
        n_scored += 1

    conn.commit()
    log(f"{n_scored}/{len(listings)} 件の物件をスコアリングしました")
    return n_scored
