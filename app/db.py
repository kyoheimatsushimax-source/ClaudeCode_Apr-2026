"""SQLite 接続とスキーマ定義。"""

import sqlite3
from pathlib import Path

from . import config

SCHEMA = """
-- 国交省 不動産取引価格情報（成約・取引ベース）
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    price_category TEXT,            -- 「成約価格情報」「不動産取引価格情報」等
    type TEXT,                      -- 「中古マンション等」等
    muni_code TEXT,
    prefecture TEXT NOT NULL,
    municipality TEXT NOT NULL,
    district TEXT,                  -- 地区名（町丁目相当）
    price INTEGER NOT NULL,         -- 取引価格（円）
    area_sqm REAL NOT NULL,
    unit_price REAL NOT NULL,       -- 円/㎡（price / area_sqm）
    floor_plan TEXT,
    building_year INTEGER,          -- 西暦
    age_at_trade INTEGER,           -- 取引時点の築年数
    structure TEXT,
    period_year INTEGER NOT NULL,
    period_quarter INTEGER NOT NULL,
    raw_json TEXT,
    UNIQUE(muni_code, district, price, area_sqm, building_year,
           period_year, period_quarter, floor_plan) ON CONFLICT IGNORE
);
CREATE INDEX IF NOT EXISTS idx_tx_area ON transactions(prefecture, municipality, district);
CREATE INDEX IF NOT EXISTS idx_tx_period ON transactions(period_year, period_quarter);

-- 掲載中物件（ListingProvider 経由で取り込む）
CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,           -- プロバイダ名（csv 等）
    source_id TEXT NOT NULL,        -- プロバイダ内で一意なID
    listing_type TEXT NOT NULL CHECK(listing_type IN ('sale', 'rent')),
    title TEXT,
    url TEXT,
    price INTEGER NOT NULL,         -- sale: 円 / rent: 円/月（管理費込み推奨）
    area_sqm REAL NOT NULL,
    unit_price REAL NOT NULL,       -- sale: 円/㎡ / rent: 円/㎡/月
    building_year INTEGER,
    address TEXT,
    prefecture TEXT,
    municipality TEXT,
    district TEXT,
    station TEXT,
    walk_min INTEGER,
    lat REAL,
    lng REAL,
    active INTEGER NOT NULL DEFAULT 1,
    imported_at TEXT,
    UNIQUE(source, source_id) ON CONFLICT REPLACE
);
CREATE INDEX IF NOT EXISTS idx_listings_area ON listings(prefecture, municipality, district);

-- エリア×築年帯×広さ帯の㎡単価統計（フォールバックレベル別に事前計算）
-- level 0: 地区×築年帯×広さ帯 / 1: 地区×広さ帯 / 2: 市区町村×築年帯×広さ帯
-- level 3: 市区町村×広さ帯    / 4: 市区町村全体
CREATE TABLE IF NOT EXISTS area_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    basis TEXT NOT NULL CHECK(basis IN ('sale', 'rent')),  -- sale=成約, rent=掲載賃料
    level INTEGER NOT NULL,
    prefecture TEXT NOT NULL,
    municipality TEXT NOT NULL,
    district TEXT,
    age_band TEXT,
    size_band TEXT,
    median_unit_price REAL NOT NULL,
    mean_unit_price REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    UNIQUE(basis, level, prefecture, municipality, district, age_band, size_band)
        ON CONFLICT REPLACE
);

-- 市区町村単位の㎡単価トレンド回帰（四半期中央値に対する OLS）
CREATE TABLE IF NOT EXISTS trend_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    basis TEXT NOT NULL,
    prefecture TEXT NOT NULL,
    municipality TEXT NOT NULL,
    slope REAL NOT NULL,            -- 円/㎡ per 四半期
    intercept REAL NOT NULL,
    n INTEGER NOT NULL,             -- 回帰に使った四半期数
    r2 REAL,
    t_mean REAL NOT NULL,           -- 回帰窓の t 平均（t = year*4 + quarter）
    t_latest INTEGER NOT NULL,      -- データが存在する最新の t
    UNIQUE(basis, prefecture, municipality) ON CONFLICT REPLACE
);

-- 物件ごとの割安スコア
CREATE TABLE IF NOT EXISTS scores (
    listing_id INTEGER PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
    market_median REAL,
    market_deviation_pct REAL,      -- マイナス = 相場より安い
    market_sample_count INTEGER,
    market_level INTEGER,           -- フォールバックレベル（信頼度指標）
    trend_expected REAL,
    trend_deviation_pct REAL,
    score REAL,                     -- 0-100（高いほど割安）
    confidence TEXT,                -- high / medium / low
    outlier INTEGER NOT NULL DEFAULT 0,
    outlier_reason TEXT,
    gross_yield_pct REAL,           -- 想定表面利回り（参考値）
    computed_at TEXT
);

-- ジオコーディング結果キャッシュ（国土地理院API）
CREATE TABLE IF NOT EXISTS geocode_cache (
    query TEXT PRIMARY KEY,
    lat REAL,
    lng REAL,
    resolved TEXT,
    created_at TEXT
);

-- 地区の代表点（ヒートマップ描画用の重心）
CREATE TABLE IF NOT EXISTS area_points (
    prefecture TEXT NOT NULL,
    municipality TEXT NOT NULL,
    district TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    PRIMARY KEY (prefecture, municipality, district)
);
"""


def get_conn(db_path: Path | str | None = None) -> sqlite3.Connection:
    path = Path(db_path) if db_path else config.DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()
