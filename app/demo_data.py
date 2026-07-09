"""デモ用の合成データ生成（APIキー無しで動作確認するためのもの）。

実データではない。国交省APIの取込結果と同じ形の成約レコードを
決定論的（固定シード）に生成する。
"""

from __future__ import annotations

import random

from .mlit import insert_transactions

# (都道府県, 市区町村, 地区, lat, lng, 2022年基準㎡単価, 年率ドリフト)
DEMO_DISTRICTS = [
    ("東京都", "江東区", "豊洲", 35.6551, 139.7965, 1_150_000, 0.06),
    ("東京都", "世田谷区", "三軒茶屋", 35.6435, 139.6712, 1_100_000, 0.05),
    ("東京都", "練馬区", "石神井町", 35.7410, 139.6060, 750_000, 0.03),
    ("東京都", "北区", "赤羽", 35.7780, 139.7210, 800_000, 0.04),
    ("神奈川県", "横浜市港北区", "日吉", 35.5530, 139.6460, 850_000, 0.04),
    ("神奈川県", "川崎市中原区", "小杉町", 35.5760, 139.6570, 950_000, 0.05),
    ("千葉県", "千葉市美浜区", "打瀬", 35.6490, 140.0430, 550_000, 0.02),
    ("千葉県", "市川市", "市川", 35.7310, 139.9070, 650_000, 0.03),
    ("埼玉県", "さいたま市大宮区", "桜木町", 35.9060, 139.6220, 700_000, 0.04),
    ("埼玉県", "川口市", "川口", 35.8010, 139.7200, 650_000, 0.03),
]

# 生成する四半期範囲（3年 = 12四半期）
QUARTERS = [(y, q) for y in (2022, 2023, 2024, 2025) for q in (1, 2, 3, 4)][2:14]

FLOOR_PLANS = ["1LDK", "2LDK", "3LDK", "3LDK", "2DK"]


def _unit_price(base: float, drift: float, years_from_2022: float,
                age: int, rng: random.Random) -> float:
    """基準単価に築年減価・経年ドリフト・ノイズを乗せる。"""
    trend = (1.0 + drift) ** years_from_2022
    age_discount = 1.0 / (1.0 + 0.018 * age)
    noise = rng.uniform(0.92, 1.08)
    return base * trend * age_discount * noise


def generate_transactions(seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for pref, muni, district, _lat, _lng, base, drift in DEMO_DISTRICTS:
        for year, quarter in QUARTERS:
            years = (year - 2022) + (quarter - 1) / 4
            for i in range(rng.randint(7, 13)):
                age = rng.randint(0, 35)
                area = round(rng.uniform(30, 90), 0)
                unit = _unit_price(base, drift, years, age, rng)
                price = int(round(unit * area / 100_000) * 100_000)
                rows.append({
                    "price_category": "成約価格情報",
                    "type": "中古マンション等",
                    "muni_code": None,
                    "prefecture": pref,
                    "municipality": muni,
                    "district": district,
                    "price": price,
                    "area_sqm": area,
                    "unit_price": price / area,
                    "floor_plan": rng.choice(FLOOR_PLANS),
                    "building_year": year - age,
                    "age_at_trade": age,
                    "structure": "ＲＣ",
                    "period_year": year,
                    "period_quarter": quarter,
                    "raw_json": None,
                })
    return rows


def seed_demo_transactions(conn, log=print) -> int:
    rows = generate_transactions()
    n = insert_transactions(conn, rows)
    for pref, muni, district, lat, lng, _base, _drift in DEMO_DISTRICTS:
        conn.execute(
            "INSERT OR REPLACE INTO area_points VALUES (?, ?, ?, ?, ?)",
            (pref, muni, district, lat, lng),
        )
    conn.commit()
    log(f"デモ成約データ {n} 件を投入しました（合成データ）")
    return n
