"""FastAPI サーバ。/api 配下で JSON を配信し、/ でフロントエンドを返す。"""

from __future__ import annotations

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, stats
from .db import get_conn

app = FastAPI(title="関東マンション割安マップ")


def _rows_to_dicts(rows) -> list[dict]:
    return [dict(r) for r in rows]


@app.get("/api/meta")
def meta():
    conn = get_conn()
    try:
        tx = conn.execute(
            """SELECT COUNT(*) AS n,
                      MIN(period_year * 4 + period_quarter) AS t_min,
                      MAX(period_year * 4 + period_quarter) AS t_max
               FROM transactions"""
        ).fetchone()
        listings = conn.execute(
            """SELECT listing_type, COUNT(*) AS n FROM listings
               WHERE active = 1 GROUP BY listing_type"""
        ).fetchall()
        munis = conn.execute(
            """SELECT DISTINCT prefecture, municipality FROM listings
               WHERE active = 1 ORDER BY prefecture, municipality"""
        ).fetchall()

        def _fmt_t(t):
            # t = year * 4 + quarter (quarter は 1-4) なので余り 0 は前年Q4
            if t is None:
                return None
            y, q = divmod(t, 4)
            return f"{y}Q{q}" if q else f"{y - 1}Q4"

        return {
            "transactions": {"count": tx["n"],
                             "from": _fmt_t(tx["t_min"]),
                             "to": _fmt_t(tx["t_max"])},
            "listings": {r["listing_type"]: r["n"] for r in listings},
            "municipalities": _rows_to_dicts(munis),
        }
    finally:
        conn.close()


_LISTING_SELECT = """
    SELECT l.id, l.source, l.source_id, l.listing_type, l.title, l.url,
           l.price, l.area_sqm, l.unit_price, l.building_year, l.address,
           l.prefecture, l.municipality, l.district, l.station, l.walk_min,
           l.lat, l.lng,
           s.market_median, s.market_deviation_pct, s.market_sample_count,
           s.market_level, s.trend_expected, s.trend_deviation_pct,
           s.score, s.confidence, s.outlier, s.outlier_reason,
           s.gross_yield_pct
    FROM listings l LEFT JOIN scores s ON s.listing_id = l.id
    WHERE l.active = 1
"""


@app.get("/api/listings")
def listings(
    listing_type: str = Query("sale", pattern="^(sale|rent)$"),
    price_min: int | None = None,
    price_max: int | None = None,
    area_min: float | None = None,
    area_max: float | None = None,
    age_max: int | None = None,
    walk_max: int | None = None,
    municipality: str | None = None,
    score_min: float | None = None,
    exclude_outliers: bool = True,
):
    sql = _LISTING_SELECT + " AND l.listing_type = ?"
    params: list = [listing_type]
    if price_min is not None:
        sql += " AND l.price >= ?"
        params.append(price_min)
    if price_max is not None:
        sql += " AND l.price <= ?"
        params.append(price_max)
    if area_min is not None:
        sql += " AND l.area_sqm >= ?"
        params.append(area_min)
    if area_max is not None:
        sql += " AND l.area_sqm <= ?"
        params.append(area_max)
    if age_max is not None:
        sql += " AND l.building_year IS NOT NULL AND l.building_year >= ?"
        params.append(_current_year() - age_max)
    if walk_max is not None:
        sql += " AND l.walk_min IS NOT NULL AND l.walk_min <= ?"
        params.append(walk_max)
    if municipality:
        sql += " AND l.municipality = ?"
        params.append(municipality)
    if score_min is not None:
        sql += " AND s.score >= ?"
        params.append(score_min)
    if exclude_outliers:
        sql += " AND COALESCE(s.outlier, 0) = 0"
    sql += " ORDER BY s.score DESC NULLS LAST"

    conn = get_conn()
    try:
        return _rows_to_dicts(conn.execute(sql, params).fetchall())
    finally:
        conn.close()


@app.get("/api/rankings")
def rankings(
    listing_type: str = Query("sale", pattern="^(sale|rent)$"),
    limit: int = Query(20, le=100),
):
    """割安スコア上位ランキング（外れ値は除外）。"""
    conn = get_conn()
    try:
        rows = conn.execute(
            _LISTING_SELECT + """
              AND l.listing_type = ? AND s.outlier = 0 AND s.score IS NOT NULL
            ORDER BY s.score DESC LIMIT ?""",
            (listing_type, limit),
        ).fetchall()
        return _rows_to_dicts(rows)
    finally:
        conn.close()


@app.get("/api/areas")
def areas(basis: str = Query("sale", pattern="^(sale|rent)$")):
    """地区別㎡単価ヒートマップ用データ（地区代表点 + 中央値）。"""
    conn = get_conn()
    try:
        rows = conn.execute(
            """SELECT a.prefecture, a.municipality, a.district,
                      a.median_unit_price, a.sample_count, p.lat, p.lng
               FROM area_stats a
               JOIN area_points p
                 ON p.prefecture = a.prefecture
                AND p.municipality = a.municipality
                AND p.district = a.district
               WHERE a.basis = ? AND a.level = ?""",
            (basis, stats.HEATMAP_LEVEL),
        ).fetchall()
        return _rows_to_dicts(rows)
    finally:
        conn.close()


def _current_year() -> int:
    import datetime

    return datetime.date.today().year


@app.get("/")
def index():
    return FileResponse(config.FRONTEND_DIR / "index.html")


app.mount("/static", StaticFiles(directory=config.FRONTEND_DIR), name="static")
