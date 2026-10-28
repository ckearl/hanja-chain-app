# Data & asset notices

The MIT license in `LICENSE` covers this repository's **code**. The bundled data and
fonts come from third parties under their own terms:

## Dictionary database — `assets/db/hanja.db`

Built by [`scripts/build-local-db.py`](scripts/build-local-db.py) from a separate data
pipeline that combines:

| Data | Source | Terms |
|---|---|---|
| Korean word definitions, Hanja forms | 국립국어원 [표준국어대사전](https://stdict.korean.go.kr/) (Standard Korean Language Dictionary) | CC BY-SA 2.0 KR |
| Learner vocabulary, English translations | 국립국어원 [한국어기초사전](https://krdict.korean.go.kr/) (Basic Korean Dictionary) | CC BY-SA 2.0 KR |
| 1,800 basic Hanja list (교육용 기초한자) | Ministry of Education list, via [Korean Wikipedia](https://ko.wikipedia.org/wiki/대한민국_중고등학교_기초한자_목록) | CC BY-SA 4.0 |
| Grade levels, readings, radicals, stroke counts | 사단법인 [한국어문회](https://www.hanja.re.kr/) grade lists, via [rycont/hanja-grade-dataset](https://github.com/rycont/hanja-grade-dataset) | © 한국어문회 |
| English character glosses | [Unicode Unihan database](https://www.unicode.org/charts/unihan.html) | Unicode License v3 |
| Stroke-order outlines and medians | [animCJK](https://github.com/parsimonhi/animCJK), [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) | Arphic Public License, see [`assets/db/STROKES-LICENSE.txt`](assets/db/STROKES-LICENSE.txt) |

Because it adapts the CC BY-SA dictionaries, the database as a whole is shared under
**CC BY-SA 4.0** (excluding the stroke data, which stays under the Arphic Public
License). The 한국어문회 grade data is their copyright; it is included for
non-commercial study, and will be removed on request.

## Fonts — `assets/fonts/`

Subsets of Noto Serif CJK KR, © Adobe, SIL Open Font License 1.1. See
[`assets/fonts/OFL.txt`](assets/fonts/OFL.txt).
