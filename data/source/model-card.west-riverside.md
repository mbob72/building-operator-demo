---
project: west_riverside_hospital
models:
  - file: arc_ifc2x3.ifc
    discipline: Architecture
    schema: IFC2X3
  - file: arc_ifc4.ifc
    discipline: Architecture
    schema: IFC4
  - file: str_ifc2x3.ifc
    discipline: Structural
    schema: IFC2X3
  - file: str_ifc4.ifc
    discipline: Structural
    schema: IFC4
  - file: mech_ifc2x3.ifc
    discipline: Mechanical
    schema: IFC2X3
  - file: mech_ifc4.ifc
    discipline: Mechanical
    schema: IFC4
  - file: plumb_ifc2x3.ifc
    discipline: Plumbing
    schema: IFC2X3
  - file: plumb_ifc4.ifc
    discipline: Plumbing
    schema: IFC4
  - file: elec_ifc2x3.ifc
    discipline: Electrical
    schema: IFC2X3
  - file: elec_ifc4.ifc
    discipline: Electrical
    schema: IFC4
  - file: fire_ifc2x3.ifc
    discipline: Fire Alarm
    schema: IFC2X3
  - file: fire_ifc4.ifc
    discipline: Fire Alarm
    schema: IFC4
  - file: sprinkle_ifc2x3.ifc
    discipline: Sprinklers
    schema: IFC2X3
  - file: sprinkle_ifc4.ifc
    discipline: Sprinklers
    schema: IFC4
license: CC BY 3.0
usage: healthcare
author: "Solihin, W. West Riverside Hospital IFC Models. OpenIFC Model Repository, University of Auckland."
source: "https://openifcmodel.cs.auckland.ac.nz/"
---

# west_riverside_hospital

## Описание

Большое многоэтажное здание больницы предоставлено Wawan Solihin (Сингапур) и опубликовано
профессором Robert Amor из University of Auckland в OpenIFC Model Repository. Набор содержит семь
дисциплин в IFC 2X3 и IFC 4 и является одним из наиболее полных открытых многодисциплинарных
BIM-наборов с несколькими версиями схемы.

Архитектурная модель охватывает 8 уровней (от Level 1 до Level 7A, отметки 0–34 000 мм),
конструктивная — 15 уровней. Подробная механическая модель содержит 59 215 продуктов на 11 уровнях.

## Модели

| Файл | Дисциплина | Схема | Этажи | Продукты | Описание |
|------|-----------|--------|---------|----------|-------------|
| `arc_ifc2x3.ifc` | Архитектура | IFC2X3 | 8 | 15 316 | Полная модель: стены, двери, окна, колонны, балки и плиты |
| `arc_ifc4.ifc` | Архитектура | IFC4 | 8 | 15 316 | Аналог IFC4 с тем же числом продуктов |
| `str_ifc2x3.ifc` | Конструкции | IFC2X3 | 15 | 2 915 | Каркас: 1 970 балок, 255 колонн и перекрытия |
| `str_ifc4.ifc` | Конструкции | IFC4 | 15 | 2 915 | Аналог IFC4 |
| `mech_ifc2x3.ifc` | Механика | IFC2X3 | 11 | 59 215 | HVAC: 8 732 участка воздуховодов/труб, 1 064 терминала |
| `mech_ifc4.ifc` | Механика | IFC4 | 11 | 59 215 | Аналог IFC4, включая 3 916 `IfcPipeSegment` |
| `plumb_ifc2x3.ifc` | Водоснабжение | IFC2X3 | 5 | 26 942 | 4 308 участков труб, 474 терминала |
| `plumb_ifc4.ifc` | Водоснабжение | IFC4 | 5 | 26 942 | Аналог IFC4 |
| `elec_ifc2x3.ifc` | Электрика | IFC2X3 | 7 | 6 305 | 1 410 flow terminals, 84 участка |
| `elec_ifc4.ifc` | Электрика | IFC4 | 7 | 6 305 | Аналог IFC4, включая 1 272 `IfcLightFixture` |
| `fire_ifc2x3.ifc` | Пожарная сигнализация | IFC2X3 | 5 | 874 | Устройства пожарной сигнализации |
| `fire_ifc4.ifc` | Пожарная сигнализация | IFC4 | 5 | 874 | Аналог IFC4 |
| `sprinkle_ifc2x3.ifc` | Спринклеры | IFC2X3 | 5 | 38 255 | 6 228 участков труб, 1 354 спринклерные головки |
| `sprinkle_ifc4.ifc` | Спринклеры | IFC4 | 5 | 38 255 | Аналог IFC4, включая 1 354 `IfcFireSuppressionTerminal` |

## Известные ограничения

- **Нет элементов `IfcSpace`**, включая архитектурный файл. Помещения не смоделированы как IFC
  spatial units; пространственный анализ может опираться только на принадлежность этажу.
- **В IFC4 MEP меньше property sets**, чем в IFC2X3. При конвертации mechanical, plumbing и
  sprinkler моделей не перенесён `Pset_DistributionFlowElementCommon` с `Reference`.
- **Пустое имя здания**: `IfcBuilding.Name` не заполнен, `IfcProject.Name` равен `"Project Number"`.
- **Много неразмещённых MEP-элементов** (например, 39 532 в mechanical): это fittings/accessories
  без прямой spatial containment, что типично для экспорта Revit MEP.
- Модель пожарной сигнализации (874 продукта, 12 property sets) содержит минимум свойств.

## Разбивка архитектурной модели по уровням

| Уровень | Отметка (мм) | Элементы |
|-------|---------------|----------|
| Level 1 | 0 | 844 |
| Level 2 | 6,000 | 909 |
| Level 3 | 11,000 | 1,167 |
| Level 4 | 16,000 | 856 |
| Level 5 | 21,000 | 788 |
| Level 6 | 26,000 | 448 |
| Level 7A | 31,000 | 154 |
| Level 7 | 34,000 | 21 |
