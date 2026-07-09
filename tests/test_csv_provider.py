"""CSV/JSON インポートアダプタのテスト。"""

import json

import pytest

from app.listings.csv_provider import CsvListingProvider

CSV_HEADER = ("source_id,listing_type,price,area_sqm,building_year,"
              "prefecture,municipality,district,walk_min,lat,lng\n")


def write_csv(tmp_path, body):
    p = tmp_path / "listings.csv"
    p.write_text(CSV_HEADER + body, encoding="utf-8")
    return p


class TestCsv:
    def test_parses_valid_row(self, tmp_path):
        p = write_csv(
            tmp_path,
            "A1,sale,58000000,60.5,2010,東京都,江東区,豊洲,5,35.65,139.79\n",
        )
        items = list(CsvListingProvider(p).fetch())
        assert len(items) == 1
        item = items[0]
        assert item.source_id == "A1"
        assert item.listing_type == "sale"
        assert item.price == 58_000_000
        assert item.unit_price == pytest.approx(58_000_000 / 60.5)
        assert item.walk_min == 5
        assert item.lat == 35.65

    def test_japanese_type_aliases(self, tmp_path):
        p = write_csv(
            tmp_path,
            "A1,売買,50000000,60,2010,東京都,江東区,豊洲,5,,\n"
            "A2,賃貸,200000,50,2015,東京都,江東区,豊洲,5,,\n",
        )
        items = list(CsvListingProvider(p).fetch())
        assert [i.listing_type for i in items] == ["sale", "rent"]

    def test_price_man_column(self, tmp_path):
        p = tmp_path / "x.csv"
        p.write_text(
            "source_id,listing_type,price_man,area_sqm\nA1,sale,5800,60\n",
            encoding="utf-8",
        )
        items = list(CsvListingProvider(p).fetch())
        assert items[0].price == 58_000_000

    def test_invalid_rows_collected_not_raised(self, tmp_path):
        p = write_csv(
            tmp_path,
            ",sale,50000000,60,2010,東京都,江東区,豊洲,5,,\n"        # source_id 欠落
            "A2,不明,50000000,60,2010,東京都,江東区,豊洲,5,,\n"      # 不正な種別
            "A3,sale,-100,60,2010,東京都,江東区,豊洲,5,,\n"          # 不正な価格
            "A4,sale,50000000,60,2010,東京都,江東区,豊洲,5,,\n",     # 正常
        )
        provider = CsvListingProvider(p)
        items = list(provider.fetch())
        assert [i.source_id for i in items] == ["A4"]
        assert len(provider.row_errors) == 3

    def test_bom_handled(self, tmp_path):
        p = tmp_path / "bom.csv"
        p.write_text(
            "﻿source_id,listing_type,price,area_sqm\nA1,sale,50000000,60\n",
            encoding="utf-8",
        )
        items = list(CsvListingProvider(p).fetch())
        assert items[0].source_id == "A1"


class TestJson:
    def test_parses_json_array(self, tmp_path):
        p = tmp_path / "listings.json"
        p.write_text(json.dumps([{
            "source_id": "J1", "listing_type": "rent", "price": 150000,
            "area_sqm": 45.0, "municipality": "江東区",
        }]), encoding="utf-8")
        items = list(CsvListingProvider(p).fetch())
        assert items[0].listing_type == "rent"
        assert items[0].price == 150_000

    def test_non_array_json_raises(self, tmp_path):
        p = tmp_path / "listings.json"
        p.write_text(json.dumps({"a": 1}), encoding="utf-8")
        with pytest.raises(ValueError):
            list(CsvListingProvider(p).fetch())
