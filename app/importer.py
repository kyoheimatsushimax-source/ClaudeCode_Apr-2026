"""ListingProvider から listings テーブルへの取り込み処理。"""

from __future__ import annotations

import datetime

from .geocode import geocode
from .listings.provider import ImportResult, ListingProvider


def import_listings(
    conn,
    provider: ListingProvider,
    do_geocode: bool = True,
    log=print,
) -> ImportResult:
    """プロバイダの物件を upsert する。lat/lng 欠損は住所からジオコーディング。"""
    result = ImportResult()
    if not provider.enabled:
        log(f"プロバイダ {provider.name} は無効化されています。スキップします。")
        return result

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for listing in provider.fetch():
        lat, lng = listing.lat, listing.lng
        if (lat is None or lng is None) and do_geocode:
            query = listing.address or "".join(
                filter(None, [listing.prefecture, listing.municipality,
                              listing.district])
            )
            coords = geocode(conn, query)
            if coords:
                lat, lng = coords
        conn.execute(
            """INSERT INTO listings
               (source, source_id, listing_type, title, url, price, area_sqm,
                unit_price, building_year, address, prefecture, municipality,
                district, station, walk_min, lat, lng, active, imported_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
            (provider.name, listing.source_id, listing.listing_type,
             listing.title, listing.url, listing.price, listing.area_sqm,
             listing.unit_price, listing.building_year, listing.address,
             listing.prefecture, listing.municipality, listing.district,
             listing.station, listing.walk_min, lat, lng, now),
        )
        result.imported += 1
    conn.commit()

    errors = getattr(provider, "row_errors", [])
    result.skipped = len(errors)
    result.errors = errors
    for e in errors:
        log(f"  スキップ: {e}")

    update_area_points(conn)
    return result


def update_area_points(conn) -> None:
    """物件座標の平均から地区代表点を更新する（ヒートマップ描画用）。"""
    conn.execute(
        """INSERT OR REPLACE INTO area_points
           SELECT prefecture, municipality, district, AVG(lat), AVG(lng)
           FROM listings
           WHERE lat IS NOT NULL AND lng IS NOT NULL
             AND prefecture IS NOT NULL AND municipality IS NOT NULL
             AND district IS NOT NULL
           GROUP BY prefecture, municipality, district"""
    )
    conn.commit()
