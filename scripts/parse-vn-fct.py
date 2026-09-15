"""
Parse the Vietnamese Food Composition Table (Viện Dinh dưỡng, 2007) PDF into JSON.

    python scripts/parse-vn-fct.py .data/vn-fct/VTN_FCT_2007.pdf .data/vn-fct/vn-fct.json

Source: https://www.fao.org/fileadmin/templates/food_composition/documents/pdf/VTN_FCT_2007.pdf

The table is copyrighted by the National Institute of Nutrition. The parsed
JSON stays in the gitignored .data/ folder, for personal use; do not commit or
redistribute it.

Layout: one food per page. The nutrient labels are real Unicode text, but the
header (the food's Vietnamese name) is set in a legacy TCVN3 ("ABC") font, so
"G¹o tÎ gi·" has to be mapped back to "Gạo tẻ giã". Some lines are also
rendered twice over themselves for a bold effect ("MMaaggiiêê"); those are
un-doubled before matching.

Requires: pip install pdfplumber
"""

import json
import re
import sys

import pdfplumber

# TCVN3 (TCVN 5712:1993, "ABC" fonts) → Unicode. pdfplumber reports a few of
# the single-byte glyphs as look-alike Unicode (0xB5 as μ, 0xAD as −), so both
# forms are listed.
TCVN3 = {
    "¸": "á", "µ": "à", "μ": "à", "¶": "ả", "·": "ã", "¹": "ạ",
    "¨": "ă", "¾": "ắ", "»": "ằ", "¼": "ẳ", "½": "ẵ", "Æ": "ặ",
    "©": "â", "Ê": "ấ", "Ç": "ầ", "È": "ẩ", "É": "ẫ", "Ë": "ậ",
    "®": "đ",
    "Ð": "é", "Ì": "è", "Î": "ẻ", "Ï": "ẽ", "Ñ": "ẹ",
    "ª": "ê", "Õ": "ế", "Ò": "ề", "Ó": "ể", "Ô": "ễ", "Ö": "ệ",
    "Ý": "í", "×": "ì", "Ø": "ỉ", "Ü": "ĩ", "Þ": "ị",
    "ã": "ó", "ß": "ò", "á": "ỏ", "â": "õ", "ä": "ọ",
    "«": "ô", "è": "ố", "å": "ồ", "æ": "ổ", "ç": "ỗ", "é": "ộ",
    "¬": "ơ", "í": "ớ", "ê": "ờ", "ë": "ở", "ì": "ỡ", "î": "ợ",
    "ó": "ú", "ï": "ù", "ñ": "ủ", "ò": "ũ", "ô": "ụ",
    "­": "ư", "−": "ư", "ø": "ứ", "õ": "ừ", "ö": "ử", "÷": "ữ", "ù": "ự",
    "ý": "ý", "ú": "ỳ", "û": "ỷ", "ü": "ỹ", "þ": "ỵ",
    "¡": "Ă", "¢": "Â", "§": "Đ", "£": "Ê", "¤": "Ô", "¥": "Ơ", "¦": "Ư",
}


def from_tcvn3(text: str) -> str:
    return "".join(TCVN3.get(c, c) for c in text)


def undouble(line: str) -> str:
    """'MMaaggiiêê ((MMaaggnn' → 'Magiê (Magn' when every character is doubled."""
    if len(line) >= 4 and all(line[i] == line[i + 1] for i in range(0, len(line) - 1, 2)):
        return line[::2]
    return line


def number(raw):
    if raw is None or raw.strip() in ("-", ""):
        return None
    try:
        return float(raw.replace(",", "."))
    except ValueError:
        return None


# Left-column nutrient lines. Each captures the value right after the unit.
NUTRIENTS = {
    "kcal": re.compile(r"^Năng lượng \(Energy\) KCal (\S+)"),
    "protein_g": re.compile(r"^Protein g (\S+)"),
    "fat_g": re.compile(r"^Lipid \(Fat\) g (\S+)"),
    "carbs_g": re.compile(r"^Glucid \(Carbohydrate\) g (\S+)"),
    "fiber_g": re.compile(r"^Celluloza \(Fiber\) g (\S+)"),
    "sugar_g": re.compile(r"^Đường tổng số \(Sugar\) g (\S+)"),
    "sodium_mg": re.compile(r"^Natri \(Sodium\) mg (\S+)"),
    "water_g": re.compile(r"^Nước \(Water\) g (\S+)"),
}

HEADER_VI = re.compile(r"\(Vietnamese\):\s*(.*?)\s+STT:\s*(\d+)")
HEADER_EN = re.compile(r"\(English\):\s*(.*?)\s+M\S* s\S*:\s*(\d+)")
WASTE = re.compile(r"\(%\):\s*(\S+)")

# First digits of the food code → the table's food groups (Phần 2 of the book).
GROUPS = {
    1: "Ngũ cốc và sản phẩm chế biến",
    2: "Khoai củ và sản phẩm chế biến",
    3: "Hạt, quả giàu protein, lipid và sản phẩm chế biến",
    4: "Rau, quả, củ dùng làm rau",
    5: "Quả chín",
    6: "Dầu, mỡ, bơ",
    7: "Thịt và sản phẩm chế biến",
    8: "Thủy sản và sản phẩm chế biến",
    9: "Trứng và sản phẩm chế biến",
    10: "Sữa và sản phẩm chế biến",
    11: "Đồ hộp",
    12: "Đồ ngọt (đường, bánh, mứt, kẹo)",
    13: "Gia vị, nước chấm",
    14: "Nước giải khát, bia, rượu",
}


def parse_page(text: str):
    lines = [undouble(l.strip()) for l in text.splitlines() if l.strip()]
    joined = "\n".join(lines)
    vi = HEADER_VI.search(joined)
    en = HEADER_EN.search(joined)
    if not vi or not en:
        return None

    code = int(en.group(2))
    food = {
        "stt": int(vi.group(2)),
        "code": code,
        "name_vi": from_tcvn3(vi.group(1)).strip(),
        "name_en": en.group(1).strip(),
        "group": GROUPS.get(code // 1000),
        "waste_pct": None,
    }
    waste = WASTE.search(joined)
    if waste:
        food["waste_pct"] = number(waste.group(1))

    for key, pattern in NUTRIENTS.items():
        food[key] = None
        for line in lines:
            m = pattern.match(line)
            if m:
                food[key] = number(m.group(1))
                break
    return food


def main(src: str, dst: str):
    foods, skipped = [], []
    with pdfplumber.open(src) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            if "(Vietnamese):" not in text:
                continue
            food = parse_page(text)
            if food is None:
                skipped.append(i)
            else:
                foods.append(food)

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(foods, f, ensure_ascii=False, indent=1)

    missing = {k: sum(1 for x in foods if x[k] is None) for k in NUTRIENTS}
    print(f"parsed {len(foods)} foods, {len(skipped)} food pages unparsed: {skipped[:20]}")
    print("missing values per field:", missing)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1], sys.argv[2])
