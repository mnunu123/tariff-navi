"""부속서 PDF에서 (부속서, 구분, 코드, 설명, 쪽) 표를 뽑는다.

사용: python3 -I parse_annex.py <규정판 id> <출력 json> <pdf> [<pdf> ...]
PDF는 표 테두리가 있어서 pdfplumber 표 추출로 읽는다.
"""
import json
import re
import sys

import pdfplumber

CODE_RE = re.compile(r"^\d{4}(\.\d{2}){0,3}$|^\d{4}\.\d{2}\.\d{4}$|^\d{4}\.\d{2}\.\d{2}\.\d{2}$")
ANNEX_RE = re.compile(r"Annex\s+(I-A|I-B|I-C|II|III|IV)\b")


def norm_code(raw):
    s = raw.strip().replace(" ", "")
    return s


def clean(text):
    return re.sub(r"\s+", " ", (text or "").replace("\n", " ")).strip()


def parse(pdf_paths, regime_id):
    entries = []
    problems = []
    for path in pdf_paths:
        annex = None
        section = None
        with pdfplumber.open(path) as pdf:
            for pno, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                head = "\n".join(text.splitlines()[:3])
                m = ANNEX_RE.search(head)
                if m:
                    annex = m.group(1)
                    section = None
                if annex == "IV":
                    continue  # IV는 규칙 문장이라 표가 아님
                for table in page.extract_tables():
                    for row in table:
                        if not row or len(row) < 2:
                            continue
                        c0 = clean(row[0])
                        c1 = clean(row[1])
                        if c1 == "Description":
                            section = c0
                            continue
                        code = norm_code(c0)
                        if not code:
                            if c1 and entries and entries[-1]["annex"] == annex:
                                # 설명만 다음 줄로 넘어간 경우
                                entries[-1]["desc"] += " " + c1
                            elif c1:
                                problems.append({"file": path, "page": pno, "row": row})
                            continue
                        if not CODE_RE.match(code):
                            problems.append({"file": path, "page": pno, "row": row})
                            continue
                        entries.append({
                            "regime": regime_id,
                            "annex": annex,
                            "section": section,
                            "code": code,
                            "desc": c1,
                            "file": path.split("/")[-1],
                            "page": pno,
                        })
    return entries, problems


if __name__ == "__main__":
    regime_id, out, *pdfs = sys.argv[1:]
    entries, problems = parse(pdfs, regime_id)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=1)
    by = {}
    for e in entries:
        k = (e["annex"], e["section"])
        by[k] = by.get(k, 0) + 1
    print(f"{regime_id}: {len(entries)} entries")
    for k, v in sorted(by.items(), key=lambda x: (str(x[0][0]), str(x[0][1]))):
        print(f"  {k[0]:5} | {k[1]:30} | {v}")
    print(f"problems: {len(problems)}")
    for p in problems[:20]:
        print("  ", p)
