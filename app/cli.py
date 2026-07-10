"""コマンドラインインターフェース。

使い方:
    python -m app.cli init-db
    python -m app.cli fetch --from 2022Q3 --to 2025Q2 [--pref 13]
    python -m app.cli import data/sample/sample_listings.csv [--no-geocode]
    python -m app.cli stats [--geocode-areas]
    python -m app.cli score
    python -m app.cli demo
    python -m app.cli serve [--port 8000]
"""

from __future__ import annotations

import argparse
import re
import sys

from . import config
from .db import get_conn, init_db


def _parse_yq(s: str) -> tuple[int, int]:
    m = re.fullmatch(r"(\d{4})Q([1-4])", s.upper())
    if not m:
        raise argparse.ArgumentTypeError(f"YYYYQn 形式で指定してください: {s}")
    return int(m.group(1)), int(m.group(2))


def cmd_init_db(_args) -> None:
    conn = get_conn()
    init_db(conn)
    print(f"DB を初期化しました: {config.DB_PATH}")


def cmd_fetch(args) -> None:
    import httpx

    from .mlit import ReinfolibClient, ingest_transactions

    conn = get_conn()
    init_db(conn)
    client = ReinfolibClient()
    y1, q1 = args.from_
    y2, q2 = args.to
    prefs = [args.pref] if args.pref else None
    print(f"不動産情報ライブラリから {y1}Q{q1}〜{y2}Q{q2} を取得します…")
    try:
        total = ingest_transactions(conn, client, y1, q1, y2, q2,
                                    pref_codes=prefs)
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            print("エラー: APIキーが認証されませんでした。キーが正しいか、"
                  "利用申請が承認済みか確認してください。", file=sys.stderr)
            sys.exit(1)
        raise
    finally:
        client.close()
    print(f"マンション成約・取引データ 新規 {total} 件を保存しました")


def cmd_import(args) -> None:
    from .importer import import_listings
    from .listings.csv_provider import CsvListingProvider

    conn = get_conn()
    init_db(conn)
    provider = CsvListingProvider(args.path)
    result = import_listings(conn, provider, do_geocode=not args.no_geocode)
    print(f"取込 {result.imported} 件 / スキップ {result.skipped} 件")
    print("スコア再計算を忘れずに: python -m app.cli stats && python -m app.cli score")


def cmd_stats(args) -> None:
    from .stats import compute_area_stats

    conn = get_conn()
    init_db(conn)
    compute_area_stats(conn)
    if args.geocode_areas:
        from .geocode import fill_area_points

        fill_area_points(conn)


def cmd_score(_args) -> None:
    from .stats import score_all_listings

    conn = get_conn()
    init_db(conn)
    score_all_listings(conn)


def cmd_demo(_args) -> None:
    from .demo_data import seed_demo_transactions
    from .importer import import_listings
    from .listings.csv_provider import CsvListingProvider
    from .stats import compute_area_stats, score_all_listings

    conn = get_conn()
    init_db(conn)
    seed_demo_transactions(conn)
    csv_path = config.DATA_DIR / "sample" / "sample_listings.csv"
    result = import_listings(conn, CsvListingProvider(csv_path), do_geocode=False)
    print(f"サンプル物件 {result.imported} 件を取込みました")
    compute_area_stats(conn)
    score_all_listings(conn)
    print("デモ準備完了。`python -m app.cli serve` で起動してください。")


def cmd_serve(args) -> None:
    import uvicorn

    conn = get_conn()
    init_db(conn)
    conn.close()
    print(f"http://127.0.0.1:{args.port} をブラウザで開いてください")
    uvicorn.run("app.server:app", host=args.host, port=args.port)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli",
                                     description="関東マンション割安マップ")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init-db", help="DBスキーマを初期化").set_defaults(func=cmd_init_db)

    p = sub.add_parser("fetch", help="国交省APIから成約・取引データを取得")
    p.add_argument("--from", dest="from_", type=_parse_yq, required=True,
                   metavar="YYYYQn")
    p.add_argument("--to", dest="to", type=_parse_yq, required=True,
                   metavar="YYYYQn")
    p.add_argument("--pref", help="都道府県コード（例: 13）。省略時は1都3県")
    p.set_defaults(func=cmd_fetch)

    p = sub.add_parser("import", help="CSV/JSONから掲載物件を取込")
    p.add_argument("path")
    p.add_argument("--no-geocode", action="store_true",
                   help="lat/lng欠損時のジオコーディングを行わない")
    p.set_defaults(func=cmd_import)

    p = sub.add_parser("stats", help="エリア統計・トレンド回帰を再計算")
    p.add_argument("--geocode-areas", action="store_true",
                   help="地区代表点を国土地理院APIで補完（時間がかかる）")
    p.set_defaults(func=cmd_stats)

    sub.add_parser("score", help="全物件の割安スコアを再計算") \
        .set_defaults(func=cmd_score)

    sub.add_parser("demo", help="合成デモデータで一式セットアップ") \
        .set_defaults(func=cmd_demo)

    p = sub.add_parser("serve", help="Web サーバを起動")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.set_defaults(func=cmd_serve)

    args = parser.parse_args(argv)
    try:
        args.func(args)
    except ValueError as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
