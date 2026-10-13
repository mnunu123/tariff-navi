# 관세 부속서 내비 (우리 모두의 R&D 공모전 MVP)

미국 232조 철강·알루미늄·구리 관세에서 품목 코드가 어느 부속서(I-A, I-B, I-C, II, III)에 들어가는지,
한국산 기준 세율이 몇 %인지, 근거가 부속서 원문 어디인지 보여주는 웹 MVP.

## 폴더

| 경로 | 내용 |
| --- | --- |
| `raw/` | 백악관 부속서 원문 PDF (4월판 전체, 6월판 I-B·I-C·III) |
| `scripts/parse_annex.py` | PDF 표 → JSON (pdfplumber) |
| `scripts/build_data.py` | 4월판·6월판 데이터 묶기 → `data/annex-data.json` |
| `src/engine.js` | 판정 엔진 (규칙 순서는 아래) |
| `src/glossary.js` | 한글 제품명 → HS 앞자리 사전 (시연용) |
| `src/app.js`, `src/index.template.html` | 화면 |
| `scripts/build.mjs` | `dist/`(Vercel용 완전한 문서)와 `artifact/`(Claude 아티팩트용) 만들기 |
| `DESIGN.md` | 화면 디자인 규칙 (Apple 스타일) |
| `vercel.json` | Vercel 빌드 설정 |
| `test/engine.test.mjs` | 실제 데이터로 엔진 검사 (13개) |

## 다시 만들기

```
python3 -I scripts/parse_annex.py 2026-04-06 data/raw-2026-04.json raw/2026-04_ANNEXES.pdf
python3 -I scripts/parse_annex.py 2026-06-08-partial data/raw-2026-06-partial.json raw/2026-06_Annex-I-B.pdf raw/2026-06_Annex-I-C.pdf raw/2026-06_Annex-III.pdf
python3 -I scripts/build_data.py
node test/engine.test.mjs
node scripts/build.mjs
```

Vercel은 `vercel.json` 설정대로 `node scripts/build.mjs`를 돌리고 `dist/`를 배포한다. 따로 고를 설정은 없다(Framework Preset: Other).

## 디자인

화면은 `DESIGN.md`(Apple 디자인 분석) 규칙을 따른다. 밝은 타일과 어두운 타일을 번갈아 쌓고, 클릭 신호는 파란색(#0066cc) 하나, 버튼은 알약 모양, 카드는 18px 둥글기와 1px 선, 그림자는 쓰지 않는다. 판정 세율은 어두운 타일 위에 혼자 놓는다.

## 판정 규칙 (위에서부터)

1. 부속서 II면 232조 없음
2. 72·73·74·76류가 아닌데 금속 무게 15% 미만이면 232조 없음
3. I-A 50% / I-B 25% (6월판부터 I-C·III 장비 제조용 84·85·87류 부품은 합계 15%) / I-C 한국 합계 15% / III 합계 15%
4. 미국산 금속 비율이 기준(4월판 95%, 6월판 85%) 이상이면 10%
5. 여러 세율이면 가장 낮은 것
6. 232조가 없으면 2026.7.24부터 301조 한국 합계 12.5% (그 전 2.20~7.23은 122조 10%)

## 데이터 메모

- 6월판 I-A는 4월판과 코드 279개가 같음 (6월 I-A PDF와 비교 확인)
- 6월판 II는 4월판에서 3701.30.00.00(알루미늄 인쇄판)만 빠짐, 나머지는 표기만 다름
- 4월판 부속서의 품명 설명 일부가 실제 HTS 품명과 다름 → 판정은 코드 기준, 화면 설명은 6월판 우선
- 미확인: I-B 일반 품목의 한국 15% 상한 여부, 자동차 부품 232조와의 관계, 301조와 한미 FTA 관계, 미국 일반관세율

작업 진행 문서: https://claude.ai/code/artifact/fdc2fd72-d48f-4bee-8bd6-f68a0a969ca3
MVP 임시 링크: https://claude.ai/artifact/85HYrzoHyMg1GLLJnAJb3s
