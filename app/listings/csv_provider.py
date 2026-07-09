"""手動 CSV / JSON インポートアダプタ（最初に完成させる最優先アダプタ）。

CSV 列（ヘッダ必須）:
    source_id, listing_type, price, area_sqm  … 必須
    title, url, building_year, address, prefecture, municipality, district,
    station, walk_min, lat, lng               … 任意

- listing_type は sale/rent のほか 売買/購入/新築/中古 → sale、賃貸 → rent を受け付ける
- price は円。万円で書きたい場合は price_man 列を使う（円換算される）
- JSON の場合は上記キーを持つオブジェクトの配列
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Iterator

from .provider import Listing, ListingProvider

_TYPE_ALIASES = {
    "sale": "sale", "buy": "sale", "売買": "sale", "購入": "sale",
    "新築": "sale", "中古": "sale", "分譲": "sale",
    "rent": "rent", "賃貸": "rent",
}

REQUIRED = ("source_id", "listing_type", "area_sqm")


class CsvListingProvider(ListingProvider):
    """CSV / JSON ファイルから掲載物件を読み込む。"""

    name = "csv"

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.row_errors: list[str] = []

    def _rows(self) -> Iterator[dict]:
        if self.path.suffix.lower() == ".json":
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                raise ValueError("JSON はオブジェクトの配列である必要があります")
            yield from data
        else:
            with self.path.open(encoding="utf-8-sig", newline="") as f:
                yield from csv.DictReader(f)

    def fetch(self) -> Iterator[Listing]:
        self.row_errors = []
        for i, row in enumerate(self._rows(), start=1):
            try:
                yield self._parse_row(row)
            except ValueError as e:
                self.row_errors.append(f"row {i}: {e}")

    def _parse_row(self, row: dict) -> Listing:
        row = {k: (v.strip() if isinstance(v, str) else v)
               for k, v in row.items() if k}
        missing = [k for k in REQUIRED if not row.get(k)]
        if missing:
            raise ValueError(f"必須列が空です: {', '.join(missing)}")

        ltype = _TYPE_ALIASES.get(str(row["listing_type"]).lower())
        if not ltype:
            raise ValueError(f"listing_type が不正です: {row['listing_type']}")

        if row.get("price"):
            price = int(float(str(row["price"]).replace(",", "")))
        elif row.get("price_man"):
            price = int(float(str(row["price_man"]).replace(",", "")) * 10000)
        else:
            raise ValueError("price または price_man が必要です")
        if price <= 0:
            raise ValueError(f"price が不正です: {price}")

        area = float(str(row["area_sqm"]).replace(",", ""))
        if area <= 0:
            raise ValueError(f"area_sqm が不正です: {area}")

        def _opt_int(key):
            v = row.get(key)
            return int(float(v)) if v not in (None, "") else None

        def _opt_float(key):
            v = row.get(key)
            return float(v) if v not in (None, "") else None

        def _opt_str(key):
            v = row.get(key)
            return str(v) if v not in (None, "") else None

        return Listing(
            source_id=str(row["source_id"]),
            listing_type=ltype,
            price=price,
            area_sqm=area,
            title=_opt_str("title"),
            url=_opt_str("url"),
            building_year=_opt_int("building_year"),
            address=_opt_str("address"),
            prefecture=_opt_str("prefecture"),
            municipality=_opt_str("municipality"),
            district=_opt_str("district"),
            station=_opt_str("station"),
            walk_min=_opt_int("walk_min"),
            lat=_opt_float("lat"),
            lng=_opt_float("lng"),
        )
