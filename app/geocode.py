"""国土地理院 API による住所ジオコーディング（SQLite キャッシュ付き）。"""

from __future__ import annotations

import datetime

import httpx

GSI_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch"


def gsi_geocode(query: str, timeout: float = 10.0) -> tuple[float, float, str] | None:
    """住所文字列を (lat, lng, 解決した表記) に。見つからなければ None。"""
    resp = httpx.get(GSI_URL, params={"q": query}, timeout=timeout)
    resp.raise_for_status()
    results = resp.json()
    if not results:
        return None
    top = results[0]
    lon, lat = top["geometry"]["coordinates"]
    title = top.get("properties", {}).get("title", "")
    return float(lat), float(lon), title


def geocode(conn, query: str) -> tuple[float, float] | None:
    """キャッシュ優先でジオコーディング。失敗もキャッシュして再問合せを防ぐ。"""
    if not query:
        return None
    row = conn.execute(
        "SELECT lat, lng FROM geocode_cache WHERE query = ?", (query,)
    ).fetchone()
    if row is not None:
        if row["lat"] is None:
            return None
        return row["lat"], row["lng"]

    try:
        result = gsi_geocode(query)
    except httpx.HTTPError:
        return None  # ネットワーク失敗はキャッシュしない

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if result is None:
        conn.execute(
            "INSERT OR REPLACE INTO geocode_cache VALUES (?, NULL, NULL, NULL, ?)",
            (query, now),
        )
        conn.commit()
        return None
    lat, lng, resolved = result
    conn.execute(
        "INSERT OR REPLACE INTO geocode_cache VALUES (?, ?, ?, ?, ?)",
        (query, lat, lng, resolved, now),
    )
    conn.commit()
    return lat, lng


def fill_area_points(conn, interval_sec: float = 0.5, log=print) -> int:
    """成約統計に現れる地区のうち代表点が無いものをジオコーディングで補完。

    国土地理院APIへの連続リクエストになるため interval_sec 秒空ける。
    """
    import time

    rows = conn.execute(
        """SELECT DISTINCT a.prefecture, a.municipality, a.district
           FROM area_stats a
           LEFT JOIN area_points p
             ON p.prefecture = a.prefecture
            AND p.municipality = a.municipality
            AND p.district = a.district
           WHERE a.district IS NOT NULL AND p.lat IS NULL"""
    ).fetchall()
    n = 0
    for r in rows:
        query = f"{r['prefecture']}{r['municipality']}{r['district']}"
        coords = geocode(conn, query)
        if coords:
            conn.execute(
                "INSERT OR REPLACE INTO area_points VALUES (?, ?, ?, ?, ?)",
                (r["prefecture"], r["municipality"], r["district"], *coords),
            )
            n += 1
        time.sleep(interval_sec)
    conn.commit()
    log(f"地区代表点を {n}/{len(rows)} 件補完しました")
    return n
