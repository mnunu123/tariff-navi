"""파싱한 부속서 표를 MVP용 데이터 하나로 묶는다.

4월판: 4월 PDF(I-A, I-B, II, III) 그대로
6월판: I-A는 4월판과 같음(6월 I-A PDF와 코드 279개 일치 확인),
       I-B·I-C·III은 6월 PDF,
       II는 4월판에서 3701.30.00.00을 뺀 것(6월 II PDF와 비교, 나머지는 표기만 다름),
       6월 IV 원문: 3701.30.00을 파생 알루미늄(I-B)으로 옮김
"""
import json

SECTION_KO = {
    "Steel": "철강",
    "Steel Derivatives": "철강 파생상품",
    "Aluminum": "알루미늄",
    "Aluminum Derivatives": "알루미늄 파생상품",
    "Aluminum Derivative": "알루미늄 파생상품",
    "Copper Articles": "구리 제품",
}

apr = json.load(open("data/raw-2026-04.json", encoding="utf-8"))
jun_part = json.load(open("data/raw-2026-06-partial.json", encoding="utf-8"))


def compact(entries):
    merged = {}
    order = []
    for e in entries:
        key = (e["annex"], e["code"])
        sec = SECTION_KO.get(e["section"], e["section"])
        if key not in merged:
            merged[key] = {"a": e["annex"], "c": e["code"], "s": [sec], "d": e["desc"], "f": e["file"], "p": e["page"]}
            order.append(key)
        elif sec not in merged[key]["s"]:
            merged[key]["s"].append(sec)
    return [merged[k] for k in order]


KO = {k.replace(".", ""): v for k, v in json.load(open("data/ko-names.json", encoding="utf-8")).items()}  # 부속서 품명 한국어, 숫자만으로 찾음
apr_c = compact(apr)
jun = [e for e in apr if e["annex"] == "I-A"]
jun += [e for e in jun_part if e["annex"] in ("I-B", "I-C", "III")]
jun += [e for e in apr if e["annex"] == "II" and e["code"] != "3701.30.00.00"]
jun_c = compact(jun)

SOURCES = {
    "apr-annex": {"title": "2026.4.2 포고문 부속서 I-A·I-B·II·III·IV", "url": "https://www.whitehouse.gov/wp-content/uploads/2026/04/ANNEXES-I-A-I-B-II-III-IV.pdf"},
    "jun-ia": {"title": "2026.6.1 포고문 부속서 I-A", "url": "https://www.whitehouse.gov/wp-content/uploads/2026/06/Annex-I-A.pdf"},
    "jun-ib": {"title": "2026.6.1 포고문 부속서 I-B", "url": "https://www.whitehouse.gov/wp-content/uploads/2026/06/Annex-I-B.pdf"},
    "jun-ic": {"title": "2026.6.1 포고문 부속서 I-C", "url": "https://www.whitehouse.gov/wp-content/uploads/2026/06/Annex-I-C.pdf"},
    "jun-ii": {"title": "2026.6.1 포고문 부속서 II", "url": "https://www.whitehouse.gov/wp-content/uploads/2026/06/Annex-II.pdf"},
    "jun-iii": {"title": "2026.6.1 포고문 부속서 III", "url": "https://www.whitehouse.gov/wp-content/uploads/2026/06/Annex-III.pdf"},
    "jun-iv": {"title": "2026.6.1 포고문 부속서 IV", "url": "https://www.whitehouse.gov/wp-content/uploads/2026/06/Annex-IV.pdf"},
}

FILE_SOURCE = {
    ("2026-04-06", "I-A"): "apr-annex", ("2026-04-06", "I-B"): "apr-annex",
    ("2026-04-06", "II"): "apr-annex", ("2026-04-06", "III"): "apr-annex",
    ("2026-06-08", "I-A"): "jun-ia", ("2026-06-08", "I-B"): "jun-ib",
    ("2026-06-08", "I-C"): "jun-ic", ("2026-06-08", "II"): "jun-ii",
    ("2026-06-08", "III"): "jun-iii",
}
for rid, lst in (("2026-04-06", apr_c), ("2026-06-08", jun_c)):
    for e in lst:
        e["src"] = FILE_SOURCE[(rid, e["a"])]
        if e["c"].replace(".", "") in KO:
            e["k"] = KO[e["c"].replace(".", "")]
        if rid == "2026-06-08" and e["a"] in ("I-A", "II"):
            # 6월판 쪽수는 4월 PDF 기준이라 쪽수는 빼고 출처만 남긴다
            e.pop("p", None)
        e.pop("f", None)

data = {
    "builtAt": "2026-10-13",
    "sources": SOURCES,
    "regimes": [
        {
            "id": "2026-04-06", "label": "4월 개편판", "from": "2026-04-06", "to": "2026-06-07",
            "proclamation": "2026.4.2 포고문 11021", "usMetalThreshold": 95,
            "features": {"ibEquipmentPartsCap": False, "annexIC": False},
        },
        {
            "id": "2026-06-08", "label": "6월 조정판", "from": "2026-06-08", "to": None,
            "proclamation": "2026.6.1 포고문", "usMetalThreshold": 85,
            "features": {"ibEquipmentPartsCap": True, "annexIC": True},
        },
    ],
    "entries": {"2026-04-06": apr_c, "2026-06-08": jun_c},
}
json.dump(data, open("data/annex-data.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

from collections import Counter
for rid in data["entries"]:
    print(rid, len(data["entries"][rid]), Counter(e["a"] for e in data["entries"][rid]))
