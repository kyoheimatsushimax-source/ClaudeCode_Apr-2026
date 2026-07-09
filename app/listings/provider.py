"""掲載物件の取得元を抽象化する ListingProvider インターフェース。

取得元（CSV、各ポータルサイト等）はこのインターフェースを実装した
アダプタとして追加し、サイト毎に差し替え・無効化できるようにする。
"""

from __future__ import annotations

import time
import urllib.robotparser
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Iterator


@dataclass
class Listing:
    """プロバイダが返す正規化済みの掲載物件。"""

    source_id: str
    listing_type: str          # 'sale' | 'rent'
    price: int                 # sale: 円 / rent: 円/月
    area_sqm: float
    title: str | None = None
    url: str | None = None
    building_year: int | None = None
    address: str | None = None
    prefecture: str | None = None
    municipality: str | None = None
    district: str | None = None
    station: str | None = None
    walk_min: int | None = None
    lat: float | None = None
    lng: float | None = None

    @property
    def unit_price(self) -> float:
        return self.price / self.area_sqm


@dataclass
class ImportResult:
    imported: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


class ListingProvider(ABC):
    """掲載物件取得アダプタの基底クラス。"""

    #: プロバイダ識別子（listings.source に保存される）
    name: str = "base"
    #: 規約上の問題等が判明した場合は False にしてアダプタ単位で無効化する
    enabled: bool = True

    @abstractmethod
    def fetch(self) -> Iterator[Listing]:
        """正規化済み Listing を順に返す。"""


class PoliteScraperProvider(ListingProvider):
    """スクレイピング型アダプタの基底クラス（Phase 3 で利用）。

    実装時の必須ルール:
    - robots.txt を遵守する（fetch 前に can_fetch で確認）
    - リクエスト間隔は 5 秒以上
    - User-Agent を明示する
    - リトライ上限を設ける
    - 対象サイトの利用規約を事前に確認し、問題があれば enabled=False にする
    """

    name = "scraper-base"
    user_agent = "KantoWaryasuMap/0.1 (personal research; contact via repository)"
    min_interval_sec = 5.0
    max_retries = 2

    def __init__(self):
        self._last_request_at = 0.0
        self._robots: dict[str, urllib.robotparser.RobotFileParser] = {}

    def can_fetch(self, url: str) -> bool:
        from urllib.parse import urlparse

        origin = "{0.scheme}://{0.netloc}".format(urlparse(url))
        rp = self._robots.get(origin)
        if rp is None:
            rp = urllib.robotparser.RobotFileParser(origin + "/robots.txt")
            try:
                rp.read()
            except OSError:
                # robots.txt が読めない場合は保守的に拒否
                rp.disallow_all = True
            self._robots[origin] = rp
        return rp.can_fetch(self.user_agent, url)

    def throttle(self) -> None:
        wait = self._last_request_at + self.min_interval_sec - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last_request_at = time.monotonic()
