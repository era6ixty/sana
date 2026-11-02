#!/usr/bin/env python3
"""
Конвертер PDF из серии «база смарт» в deck.json для приложения Sana.

Использование:
    python3 tools/convert.py "путь/к/файлу.pdf" -o public/deck.json

Требуется poppler-utils (pdftohtml). Никаких сторонних Python-пакетов.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

# ---------------------------------------------------------------------------
# Настройки разбора. Вынесены сюда, чтобы подгонять под другие книги серии.
# ---------------------------------------------------------------------------

TOC_PAGES = 3            # первые страницы с оглавлением пропускаем
MIN_BADGES_PER_PAGE = 3  # меньше — считаем страницу таблицей/текстом
HEADING_FONT = 115       # шрифт заголовков разделов
BADGE_FONT = 60          # шрифт номеров вопросов
BADGE_MAX_LEFT = 0.11    # номер вопроса прижат к левому краю
QUESTION_MAX_LEFT = 0.55 # левая колонка заканчивается посередине
OPTION_MIN_LEFT = 0.11   # варианты ответа в многоответных вопросах
ROW_PAD = 90             # запас по Y вокруг номера вопроса

# Мусор из таблиц и подписей к иллюстрациям: мелкий шрифт, поля и
# средняя зона страницы, где в этой вёрстке нет ни вопросов, ни ответов.
MIN_TEXT_FONT = 75
MIN_LEFT_MARGIN = 300
TABLE_MIDDLE_MIN = 700
TABLE_MIDDLE_MAX = 2000

# ---------------------------------------------------------------------------
# Нормализация казахского текста
# ---------------------------------------------------------------------------

# Латинские/кириллические двойники, которые встречаются в вёрстке
CHAR_MAP = {
    "Ə": "Ә", "ə": "ә",   # латинская шва -> казахская
    "I": "І", "i": "і",   # латинская i -> казахская (осторожно, только в словах)
}

# Римские числительные, набранные кириллицей: ХІХ, ХХ, ХVІІІ и т.п.
ROMAN_FIX = {
    "ХІХ": "XIX", "хіх": "xix",
    "ХХ": "XX", "хх": "xx",
    "ХVІІІ": "XVIII", "хvііі": "xviii",
    "ХVIІ": "XVII", "хviі": "xvii",
}


def clean_text(text: str) -> str:
    text = html.unescape(text)
    text = text.replace("\u00a0", " ").replace("\u200b", "").replace("\u00ad", "")
    text = re.sub(r"\s+", " ", text)
    for bad, good in ROMAN_FIX.items():
        text = text.replace(bad, good)
    text = text.replace("Ə", "Ә").replace("ə", "ә")

    # Латинские C/c/I, случайно попавшие внутрь кириллических слов
    # («Cеменов», «Уcпен», «ІI»). Английские слова и римские цифры
    # без кириллического соседства не трогаем.
    cyr = "А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі"
    text = re.sub(rf"C(?=[{cyr}])", "С", text)
    text = re.sub(rf"(?<=[{cyr}])C", "С", text)
    text = re.sub(rf"c(?=[{cyr}])", "с", text)
    text = re.sub(rf"(?<=[{cyr}])c", "с", text)
    text = re.sub(rf"(?<=[{cyr}])I", "І", text)
    text = re.sub(rf"(?<=[{cyr}])i", "і", text)
    return text.strip()


def join_blocks(blocks: list[tuple[float, float, str]]) -> str:
    """Склеивает текстовые блоки строки, убирая переносы вида «қазақ- орыс»."""
    out = ""
    for _, _, raw in sorted(blocks, key=lambda b: (b[0], b[1])):
        piece = clean_text(raw)
        if not piece:
            continue
        if not out:
            out = piece
        elif out.endswith("-") and piece[:1].islower():
            out += piece
        else:
            out += " " + piece
    return re.sub(r"\s+", " ", out).strip()


def norm_key(text: str) -> str:
    """Ключ для поиска дублей."""
    t = clean_text(text).lower()
    t = re.sub(r"[^\w\sәғқңөұүһі]", "", t, flags=re.UNICODE)
    return re.sub(r"\s+", " ", t).strip()


# ---------------------------------------------------------------------------
# Модель страницы
# ---------------------------------------------------------------------------

@dataclass
class Block:
    top: float
    left: float
    text: str
    size: float

    @property
    def is_number(self) -> bool:
        return bool(re.fullmatch(r"\d{1,3}", self.text.strip()))


@dataclass
class Page:
    number: int
    width: float
    height: float
    blocks: list[Block] = field(default_factory=list)

    def headings(self) -> list[str]:
        """Заголовки разделов: крупный шрифт в верхней части страницы."""
        raw = [b for b in self.blocks if b.size >= HEADING_FONT and b.top < self.height * 0.30]
        raw.sort(key=lambda b: b.top)
        groups: list[list[Block]] = []
        for b in raw:
            if b.text.lstrip().startswith("§") or not groups:
                groups.append([b])
            else:
                groups[-1].append(b)
        result = []
        for group in groups:
            text = clean_text(" ".join(b.text for b in group))
            if len(text) > 8:
                result.append(text)
        return result

    def badges(self) -> list[Block]:
        """Номера вопросов: мелкий шрифт у левого края."""
        return sorted(
            [
                b
                for b in self.blocks
                if b.size <= BADGE_FONT
                and b.left < self.width * BADGE_MAX_LEFT
                and b.is_number
                and self.height * 0.03 < b.top < self.height * 0.97
            ],
            key=lambda b: b.top,
        )


# ---------------------------------------------------------------------------
# Чтение PDF через pdftohtml
# ---------------------------------------------------------------------------

def load_pages(pdf_path: Path) -> list[Page]:
    with tempfile.TemporaryDirectory(prefix="sana-pdf-") as tmp:
        out_base = str(Path(tmp) / "book")
        subprocess.run(
            ["pdftohtml", "-xml", "-hidden", "-i", "-q", str(pdf_path), out_base],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        xml_path = Path(out_base + ".xml")
        root = ET.parse(xml_path).getroot()

    # В полном XML pdftohtml описывает шрифты один раз на весь документ,
    # а не на каждой странице, поэтому собираем карту глобально.
    font_sizes = {
        fs.get("id"): float(fs.get("size", "0"))
        for fs in root.iter("fontspec")
    }

    pages: list[Page] = []
    for page_el in root.findall("page"):
        page = Page(
            number=int(page_el.get("number", "0")),
            width=float(page_el.get("width", "3720")),
            height=float(page_el.get("height", "5262")),
        )
        for text_el in page_el.findall("text"):
            text = clean_text("".join(text_el.itertext()))
            if not text:
                continue
            page.blocks.append(
                Block(
                    top=float(text_el.get("top", "0")),
                    left=float(text_el.get("left", "0")),
                    text=text,
                    size=font_sizes.get(text_el.get("font", ""), 0.0),
                )
            )
        pages.append(page)
    return pages


# ---------------------------------------------------------------------------
# Извлечение строк вопрос-ответ
# ---------------------------------------------------------------------------

@dataclass
class Card:
    front: str
    back: str
    page: int
    number: int
    flags: list[str] = field(default_factory=list)


def is_page_noise(block: Block, page: Page) -> bool:
    """Колонцифра: мелкое число в верхней или нижней полосе страницы."""
    if not block.is_number:
        return False
    if block.size > BADGE_FONT:
        return False
    return block.top < page.height * 0.05 or block.top > page.height * 0.94


def extract_rows(page: Page) -> list[Card]:
    badges = page.badges()
    if len(badges) < MIN_BADGES_PER_PAGE:
        return []

    rows: list[Card] = []
    for i, badge in enumerate(badges):
        y0 = badge.top - ROW_PAD
        y1 = badges[i + 1].top - ROW_PAD if i + 1 < len(badges) else page.height - 150

        in_row = [
            b
            for b in page.blocks
            if y0 <= b.top < y1
            and not is_page_noise(b, page)
            and not (b.is_number and b.size <= BADGE_FONT and b.left < page.width * BADGE_MAX_LEFT)
            and b.size >= MIN_TEXT_FONT
            and b.left >= MIN_LEFT_MARGIN
            and not (TABLE_MIDDLE_MIN <= b.left < TABLE_MIDDLE_MAX)
        ]

        # Последняя строка страницы может «прилипнуть» к инфоблоку или таблице
        # под ней. Обрезаем по первому большому вертикальному разрыву.
        if i == len(badges) - 1 and in_row:
            ordered = sorted(in_row, key=lambda b: b.top)
            cut = len(ordered)
            for j in range(1, len(ordered)):
                if ordered[j].top - ordered[j - 1].top > 170:
                    cut = j
                    break
            in_row = ordered[:cut]

        question: list[Block] = []
        answer: list[Block] = []
        options: list[Block] = []
        for b in in_row:
            if b.left >= page.width * QUESTION_MAX_LEFT:
                answer.append(b)
            elif b.left >= page.width * OPTION_MIN_LEFT and b.top > badge.top + ROW_PAD * 0.5:
                # вариант ответа в вопросах с несколькими ответами
                if b.is_number and b.size <= BADGE_FONT:
                    continue
                options.append(b)
            else:
                question.append(b)

        front = join_blocks([(b.top, b.left, b.text) for b in question])
        back = join_blocks([(b.top, b.left, b.text) for b in answer])

        if not back and options:
            back = "; ".join(
                clean_text(b.text).rstrip("; ")
                for b in sorted(options, key=lambda b: b.top)
                if b.text.strip()
            )

        if not front or not back:
            continue

        front = re.sub(r"\s+", " ", front).strip()
        back = re.sub(r"\s+", " ", back).strip()

        flags: list[str] = []
        if len(front) > 250:
            flags.append("long")
        if len(back) < 3:
            flags.append("short")
        if any(
            re.search(r"[A-Za-z]", w) and re.search(r"[А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]", w)
            for w in front.split()
        ):
            flags.append("mixed")
        if not re.search(r"[:?]$", front):
            flags.append("no_colon")
        if options and not answer:
            flags.append("multi")

        rows.append(
            Card(
                front=front,
                back=back,
                page=page.number,
                number=int(badge.text),
                flags=flags,
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Сборка книги
# ---------------------------------------------------------------------------

def convert(pdf_path: Path) -> dict:
    pages = load_pages(pdf_path)

    decks: list[dict] = []
    current: dict | None = None
    skipped_pages: list[dict] = []
    seen_pairs: dict[str, str] = {}
    duplicates = 0
    card_seq = 0

    for page in pages:
        if page.number <= TOC_PAGES:
            continue

        headings = page.headings()
        if headings:
            title = headings[0]
            subtitle = headings[1] if len(headings) > 1 else ""
            # Не создаём новый раздел, если тот же заголовок повторяется
            if not current or norm_key(current["title"]) != norm_key(title):
                current = {
                    "id": f"deck-{len(decks) + 1}",
                    "title": title,
                    "subtitle": subtitle,
                    "pageStart": page.number,
                    "cards": [],
                }
                decks.append(current)
            elif subtitle and not current["subtitle"]:
                current["subtitle"] = subtitle

        cards = extract_rows(page)

        if not cards:
            if page.badges():
                skipped_pages.append(
                    {"page": page.number, "badges": len(page.badges()), "reason": "few_badges"}
                )
            continue

        if current is None:
            current = {
                "id": "deck-0",
                "title": "Бастапқы бөлім",
                "subtitle": "",
                "pageStart": page.number,
                "cards": [],
            }
            decks.insert(0, current)

        for card in cards:
            key = norm_key(card.front) + "|" + norm_key(card.back)
            if key in seen_pairs:
                duplicates += 1
                continue
            seen_pairs[key] = card.front
            card_seq += 1
            current["cards"].append(
                {
                    "id": f"c-{card_seq}",
                    "front": card.front,
                    "back": card.back,
                    "page": card.page,
                    "number": card.number,
                    "flags": card.flags,
                }
            )
        current["pageEnd"] = page.number

    decks = [d for d in decks if d["cards"]]
    for d in decks:
        d.setdefault("pageEnd", d["pageStart"])
        d["cardCount"] = len(d["cards"])

    total = sum(d["cardCount"] for d in decks)
    flagged = sum(1 for d in decks for c in d["cards"] if c["flags"])

    return {
        "version": 1,
        "title": "Қазақстан тарихы",
        "source": pdf_path.name,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "decks": decks,
        "stats": {
            "pages": len(pages),
            "decks": len(decks),
            "cards": total,
            "flagged": flagged,
            "duplicatesSkipped": duplicates,
            "skippedPages": skipped_pages,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="PDF «база смарт» -> deck.json")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("-o", "--output", type=Path, default=Path("public/deck.json"))
    args = parser.parse_args()

    if not args.pdf.exists():
        sys.exit(f"Файл не найден: {args.pdf}")

    data = convert(args.pdf)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    st = data["stats"]
    print(f"Готово: {args.output}")
    print(f"  разделов: {st['decks']}")
    print(f"  карточек: {st['cards']}")
    print(f"  с флагами: {st['flagged']}")
    print(f"  дублей убрано: {st['duplicatesSkipped']}")
    print(f"  пропущено страниц: {len(st['skippedPages'])}")
    for d in data["decks"]:
        print(f"  • {d['title'][:70]} — {d['cardCount']} карт.")


if __name__ == "__main__":
    main()
