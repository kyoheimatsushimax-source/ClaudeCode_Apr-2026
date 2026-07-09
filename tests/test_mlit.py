"""国交省APIレコードのパース処理のテスト。"""

from app.mlit import (
    parse_building_year,
    parse_period,
    parse_transaction_record,
    to_number,
)


class TestParseBuildingYear:
    def test_wareki(self):
        assert parse_building_year("平成15年") == 2003
        assert parse_building_year("令和3年") == 2021
        assert parse_building_year("昭和55年") == 1980

    def test_wareki_gannen(self):
        assert parse_building_year("令和元年") == 2019
        assert parse_building_year("平成元年") == 1989

    def test_seireki(self):
        assert parse_building_year("2003年") == 2003
        assert parse_building_year("1995") == 1995

    def test_zenkaku(self):
        assert parse_building_year("平成１５年") == 2003

    def test_unparseable(self):
        assert parse_building_year("戦前") is None
        assert parse_building_year("") is None
        assert parse_building_year(None) is None


class TestParsePeriod:
    def test_seireki(self):
        assert parse_period("2023年第4四半期") == (2023, 4)
        assert parse_period("2024年第１四半期") == (2024, 1)

    def test_wareki(self):
        assert parse_period("平成27年第2四半期") == (2015, 2)
        assert parse_period("令和元年第3四半期") == (2019, 3)

    def test_invalid(self):
        assert parse_period("2023年") is None
        assert parse_period(None) is None


class TestToNumber:
    def test_comma(self):
        assert to_number("1,234") == 1234.0

    def test_range_suffix(self):
        assert to_number("2000㎡以上") == 2000.0

    def test_plain(self):
        assert to_number(55) == 55.0
        assert to_number("55.5") == 55.5

    def test_invalid(self):
        assert to_number("不明") is None
        assert to_number(None) is None


class TestParseTransactionRecord:
    RECORD = {
        "PriceCategory": "成約価格情報",
        "Type": "中古マンション等",
        "MunicipalityCode": "13108",
        "Prefecture": "東京都",
        "Municipality": "江東区",
        "DistrictName": "豊洲",
        "TradePrice": "58000000",
        "Area": "60",
        "FloorPlan": "2LDK",
        "BuildingYear": "平成20年",
        "Structure": "ＲＣ",
        "Period": "2024年第3四半期",
    }

    def test_valid_record(self):
        row = parse_transaction_record(self.RECORD)
        assert row["prefecture"] == "東京都"
        assert row["district"] == "豊洲"
        assert row["price"] == 58_000_000
        assert row["area_sqm"] == 60.0
        assert row["unit_price"] == 58_000_000 / 60
        assert row["building_year"] == 2008
        assert row["age_at_trade"] == 16
        assert (row["period_year"], row["period_quarter"]) == (2024, 3)

    def test_non_mansion_skipped(self):
        rec = dict(self.RECORD, Type="宅地(土地)")
        assert parse_transaction_record(rec) is None

    def test_missing_price_skipped(self):
        rec = dict(self.RECORD, TradePrice=None)
        assert parse_transaction_record(rec) is None

    def test_missing_period_skipped(self):
        rec = dict(self.RECORD, Period="不明")
        assert parse_transaction_record(rec) is None

    def test_unknown_building_year_kept(self):
        rec = dict(self.RECORD, BuildingYear="戦前")
        row = parse_transaction_record(rec)
        assert row is not None
        assert row["building_year"] is None
        assert row["age_at_trade"] is None
