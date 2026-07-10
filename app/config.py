"""アプリ全体の設定値。環境変数で上書き可能。"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = BASE_DIR / "frontend"

DB_PATH = Path(os.environ.get("WARYASU_DB_PATH", str(DATA_DIR / "app.db")))

# 国交省 不動産情報ライブラリ API
# https://www.reinfolib.mlit.go.jp/help/apiManual/ で利用申請してキーを取得する
REINFOLIB_BASE_URL = "https://www.reinfolib.mlit.go.jp/ex-api/external"


def get_reinfolib_api_key() -> str:
    """APIキーを環境変数 → リポジトリ直下の apikey.txt の順で探す。"""
    key = os.environ.get("REINFOLIB_API_KEY", "")
    if key.strip():
        return key.strip()
    key_file = BASE_DIR / "apikey.txt"
    if key_file.exists():
        return key_file.read_text(encoding="utf-8-sig").strip()
    return ""


# 後方互換（既存コードは get_reinfolib_api_key() を使うこと）
REINFOLIB_API_KEY = get_reinfolib_api_key()

# 1都3県の都道府県コード
KANTO_PREFS = {
    "11": "埼玉県",
    "12": "千葉県",
    "13": "東京都",
    "14": "神奈川県",
}

# エリア統計に採用する最小サンプル数（これ未満なら上位レベルへフォールバック）
MIN_SAMPLES_SALE = 5
MIN_SAMPLES_RENT = 4

# トレンド回帰に使う四半期数（3年 = 12四半期）と最低データ点数
TREND_WINDOW_QUARTERS = 12
TREND_MIN_POINTS = 6
