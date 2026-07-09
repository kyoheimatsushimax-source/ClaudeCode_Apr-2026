"""国交省「不動産情報ライブラリ」API クライアントとレコードパーサ。

API 仕様: https://www.reinfolib.mlit.go.jp/help/apiManual/
- XIT001: 不動産価格（取引価格・成約価格）情報
- 認証: リクエストヘッダ `Ocp-Apim-Subscription-Key` に API キーを設定
"""

from __future__ import annotations

import json
import re
import time
import unicodedata

import httpx

from . import config

# 和暦 → 元年の西暦 - 1
_WAREKI_BASE = {"令和": 2018, "平成": 1988, "昭和": 1925, "大正": 1911, "明治": 1867}

MANSION_TYPES = ("中古マンション等",)


class ReinfolibClient:
    """XIT001（不動産価格情報）取得クライアント。

    無料APIのためリクエスト間隔を空け、429/5xx は指数バックオフで再試行する。
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = config.REINFOLIB_BASE_URL,
        min_interval: float = 1.5,
        max_retries: int = 3,
        timeout: float = 60.0,
    ):
        self.api_key = api_key or config.REINFOLIB_API_KEY
        if not self.api_key:
            raise ValueError(
                "REINFOLIB_API_KEY が未設定です。README の手順で API キーを取得し、"
                "環境変数 REINFOLIB_API_KEY に設定してください。"
            )
        self.base_url = base_url.rstrip("/")
        self.min_interval = min_interval
        self.max_retries = max_retries
        self._last_request_at = 0.0
        self._client = httpx.Client(
            timeout=timeout,
            headers={"Ocp-Apim-Subscription-Key": self.api_key},
        )

    def _throttle(self) -> None:
        wait = self._last_request_at + self.min_interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)

    def _get(self, path: str, params: dict) -> dict:
        url = f"{self.base_url}/{path}"
        backoff = 2.0
        for attempt in range(self.max_retries + 1):
            self._throttle()
            self._last_request_at = time.monotonic()
            resp = self._client.get(url, params=params)
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                time.sleep(backoff)
                backoff *= 2
                continue
            resp.raise_for_status()
            return resp.json()
        raise RuntimeError("unreachable")

    def fetch_transactions(
        self,
        year: int,
        quarter: int,
        pref_code: str | None = None,
        city_code: str | None = None,
        price_classification: str | None = None,
    ) -> list[dict]:
        """XIT001 から1四半期分の取引レコードを取得する。

        price_classification: "01"=取引価格情報のみ, "02"=成約価格情報のみ, None=両方
        """
        params: dict = {"year": year, "quarter": quarter}
        if pref_code:
            params["area"] = pref_code
        if city_code:
            params["city"] = city_code
        if price_classification:
            params["priceClassification"] = price_classification
        body = self._get("XIT001", params)
        return body.get("data", [])

    def close(self) -> None:
        self._client.close()


# ---------------------------------------------------------------- パーサ


def _z2h(s: str) -> str:
    """全角数字などを半角へ正規化。"""
    return unicodedata.normalize("NFKC", s)


def to_number(value) -> float | None:
    """"1,234" / "2000㎡以上" / 数値 を float に。解釈不能なら None。"""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = _z2h(str(value)).replace(",", "")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


def parse_building_year(value) -> int | None:
    """「平成15年」「令和3年」「2003年」等を西暦に変換。「戦前」等は None。"""
    if value is None:
        return None
    s = _z2h(str(value)).strip()
    if not s:
        return None
    for era, base in _WAREKI_BASE.items():
        if s.startswith(era):
            if s.startswith(era + "元"):
                return base + 1
            n = to_number(s[len(era):])
            return int(base + n) if n else None
    m = re.match(r"(\d{4})年?", s)
    return int(m.group(1)) if m else None


def parse_period(value) -> tuple[int, int] | None:
    """「2023年第4四半期」「平成27年第１四半期」→ (year, quarter)。"""
    if value is None:
        return None
    s = _z2h(str(value)).strip()
    year = None
    for era, base in _WAREKI_BASE.items():
        if s.startswith(era):
            if s.startswith(era + "元"):
                year = base + 1
                s_rest = s[len(era) + 1:]
            else:
                m = re.match(rf"{era}(\d+)年?(.*)", s)
                if not m:
                    return None
                year = base + int(m.group(1))
                s_rest = m.group(2)
            break
    else:
        m = re.match(r"(\d{4})年?(.*)", s)
        if not m:
            return None
        year = int(m.group(1))
        s_rest = m.group(2)
    mq = re.search(r"第?([1-4])四半期", s_rest)
    if not mq:
        return None
    return year, int(mq.group(1))


def parse_transaction_record(rec: dict) -> dict | None:
    """XIT001 の1レコードを transactions テーブル行に変換。

    マンション（中古マンション等）以外、価格/面積/時期が欠けるものは None。
    """
    if rec.get("Type") not in MANSION_TYPES:
        return None
    price = to_number(rec.get("TradePrice"))
    area = to_number(rec.get("Area"))
    period = parse_period(rec.get("Period"))
    if not price or not area or area <= 0 or not period:
        return None
    year, quarter = period
    building_year = parse_building_year(rec.get("BuildingYear"))
    age = max(0, year - building_year) if building_year else None
    return {
        "price_category": rec.get("PriceCategory"),
        "type": rec.get("Type"),
        "muni_code": rec.get("MunicipalityCode"),
        "prefecture": rec.get("Prefecture"),
        "municipality": rec.get("Municipality"),
        "district": rec.get("DistrictName"),
        "price": int(price),
        "area_sqm": area,
        "unit_price": price / area,
        "floor_plan": rec.get("FloorPlan"),
        "building_year": building_year,
        "age_at_trade": age,
        "structure": rec.get("Structure"),
        "period_year": year,
        "period_quarter": quarter,
        "raw_json": json.dumps(rec, ensure_ascii=False),
    }


def insert_transactions(conn, rows) -> int:
    """パース済み行を挿入し、新規挿入件数を返す（重複は UNIQUE 制約で無視）。"""
    before = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    conn.executemany(
        """INSERT INTO transactions
           (price_category, type, muni_code, prefecture, municipality, district,
            price, area_sqm, unit_price, floor_plan, building_year, age_at_trade,
            structure, period_year, period_quarter, raw_json)
           VALUES (:price_category, :type, :muni_code, :prefecture, :municipality,
                   :district, :price, :area_sqm, :unit_price, :floor_plan,
                   :building_year, :age_at_trade, :structure, :period_year,
                   :period_quarter, :raw_json)""",
        rows,
    )
    conn.commit()
    after = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    return after - before


def ingest_transactions(
    conn,
    client: ReinfolibClient,
    year_from: int,
    quarter_from: int,
    year_to: int,
    quarter_to: int,
    pref_codes: list[str] | None = None,
    log=print,
) -> int:
    """指定期間×都道府県の取引データを取得して DB に格納する。"""
    prefs = pref_codes or list(config.KANTO_PREFS.keys())
    total = 0
    t = year_from * 4 + (quarter_from - 1)
    t_end = year_to * 4 + (quarter_to - 1)
    while t <= t_end:
        year, quarter = divmod(t, 4)
        quarter += 1
        for pref in prefs:
            pref_name = config.KANTO_PREFS.get(pref, pref)
            records = client.fetch_transactions(year, quarter, pref_code=pref)
            rows = [r for r in (parse_transaction_record(rec) for rec in records) if r]
            n = insert_transactions(conn, rows)
            total += n
            log(f"  {year}Q{quarter} {pref_name}: 取得 {len(records)} 件 / "
                f"マンション新規 {n} 件")
        t += 1
    return total
