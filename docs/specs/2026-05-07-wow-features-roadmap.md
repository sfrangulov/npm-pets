# npm-pets — wow-features roadmap

**Date:** 2026-05-07
**Status:** draft, awaiting review
**Current version:** 0.1.2

## 1. Цель

Поднять npm-pets с «полезный CLI» до «вирального тула» по четырём сценам: уникальные инсайты, README-вставка, жизнь в терминале, шеринг в Twitter/LinkedIn. Один киллер-фича на сцену.

## 2. Шорт-лист (выбран)

| Сцена | Фича |
|---|---|
| 1. Инсайты | **Insights pack**: trend velocity + maintenance health + release streak |
| 2. README | **npm-pets.dev OG-endpoint** (`![](.../card/<user>.svg)`) |
| 3. Терминал | **Ink interactive TUI** (`--interactive`) |
| 4. Шеринг | **`--export card.png` + Persona detector** |

## 3. Порядок релизов (Path A — data-first)

```
v0.2  Insights pack          ─┐
v0.3  PNG card + Persona     ─┤  использует insights, делаем satori-renderer
v0.4  npm-pets.dev           ─┤  переиспользует satori-renderer
v0.5  Ink TUI                ─┘  finishing touch
```

Обоснование порядка:
- Insights — фундамент данных. Persona без них беднее.
- Satori-renderer пишется один раз для PNG, потом переиспользуется на сайте.
- TUI последним — к этому моменту есть весь набор данных, есть что показывать в drill-in.

## 4. v0.2 — Insights pack

### Объём

Расширить `Profile` полем `insights`. Все четыре formatter'а отображают новую секцию.

```ts
interface Insights {
  velocity: {
    last30d: number;
    prev30d: number;
    deltaPct: number;          // (last30d - prev30d) / prev30d * 100
    topGrowing: Array<{ name: string; deltaPct: number }>;  // top 3
  };
  health: {
    active: number;            // pushed < 30d
    sleeping: number;          // 30–180d
    dormant: number;           // > 180d
    perPackage: Record<string, "active" | "sleeping" | "dormant">;
  };
  streak: {
    longestMonths: number;     // самая длинная серия месяцев подряд с релизом
    currentMonths: number;     // текущая (0 если оборвалась)
    longestPackage: string;    // имя пакета с longest streak
  };
}
```

### Источники данных

- **velocity** — `getDownloadsRange(pkg, today-60d, today)` уже есть; делим массив пополам.
- **health** — `lastPushedAt` (GitHub) или fallback на `lastPublishedAt` (npm) когда GH недоступен.
- **streak** — npm `time` объект: дата каждой версии. Группируем по месяцам, считаем максимальную непрерывную серию.

### UI

- **pretty/text** — отдельный блок «Insights» с тремя строками: `📈 +47% за месяц`, `🟢 5/8 active`, `🔥 streak: 18 mo`.
- **markdown** — H2 «Insights» + bullets.
- **json** — поле `insights` в Profile.

### Out of scope для v0.2

Bus factor, ecosystem footprint, license/lang breakdown.

### Success criteria

- Insights считаются за тот же время-бюджет, что v0.1.2 (используем уже-кэшированные range-запросы).
- Все 4 формата рендерят все три insights без визуального шума.

## 5. v0.3 — `--export card.png` + Persona

### Объём

- Новый формат: `--format card` пишет SVG в stdout. Флаг `--export <file>` сохраняет PNG.
- Layout 1200×630, оптимизирован под Twitter/LinkedIn preview.
- Persona detector выбирает один из 6 архетипов на основе профиля + insights.

### Layout (1200×630)

```
┌─────────────────────────────────────────────────┐
│  npm-pets                          [GH avatar]  │
│                                                 │
│   sergey frangulov                              │
│   ~ The Streaker ~                              │
│                                                 │
│   42K        ·    180K       ·    2.4M          │
│   week            month           all time      │
│                                                 │
│   📦 npm-pets        ▁▂▃▅█      47K/mo          │
│   📦 lib-foo         ▁▁▂▄▆      12K/mo          │
│   📦 lib-bar         ▆▅▄▃▂      4K/mo           │
│                                                 │
│   8 packages · 18-month streak · ↑47% MoM       │
└─────────────────────────────────────────────────┘
```

### Стек рендера

- `satori` — JSX → SVG (Vercel'овский, без браузера).
- `@resvg/resvg-js` — SVG → PNG (rust-биндинг, ~5MB).
- Шрифт: bundle Inter Regular+Bold (~200KB суммарно) внутри пакета.
- Lazy require — оба пакета грузятся только при `--format card` или `--export`. Скорость старта `--format json` не страдает.

### Persona detector (правила)

Проверяются по приоритету сверху вниз, первый match — победитель:

| Persona | Условие |
|---|---|
| **The Rocket** 🚀 | velocity.deltaPct > 50% |
| **The Streaker** 🔥 | streak.currentMonths ≥ 12 |
| **The One-Hit Wonder** 🎯 | топ-1 пакет ≥ 80% all-time downloads |
| **The Polyglot** 🧬 | ≥ 4 разных языка в репах |
| **The Veteran** 🏛️ | firstPublishedAt > 5 лет назад И packageCount ≥ 5 |
| **The Active Maintainer** ⚒️ | ≥ 60% пакетов в `active` |
| **The Builder** 🛠️ | fallback (любой) |

Языки извлекаем из `GET /repos/{owner}/{repo}` (`language` field) — уже фетчится для звёзд, расширяем парсинг.

### Out of scope для v0.3

Animated PNG/GIF, year-in-review (`--year`), diff-карточка («было → стало»), кастомные темы.

### Success criteria

- `npm-pets sfrangulov --export card.png` производит файл < 200KB, валидный для Twitter card preview.
- Cold-start CLI с `--format json` не замедляется (lazy require доказан).

## 6. v0.4 — npm-pets.dev (сайт)

### Объём

Отдельный репозиторий, монорепо c `npm-pets`. Выделить `@npm-pets/core` (fetchers + `buildProfile`) — CLI и сайт оба зависят от него.

### Маршруты

| Path | Назначение |
|---|---|
| `/` | Landing: пример карточки, форма «введи имя», ссылка на GitHub |
| `/u/<user>` | Публичная страница профиля: те же insights что в CLI + кнопки Share-to-Twitter/Copy URL. OG-теги указывают на `/card/<user>.png`. |
| `/card/<user>.svg` | SVG-endpoint для README-вставки. Headers `Cache-Control: public, max-age=1800`. |
| `/card/<user>.png` | PNG-endpoint для OG-preview и прямого шеринга. |

### Инфра

- Next.js 15 на Vercel.
- Edge кэш 30 мин (Vercel Cache-Control + `revalidate`). Опционально Vercel KV для долгого кэша downloads-данных (≤24ч).
- Ограничения: rate-limit на `/u/<user>` (Vercel middleware), чтобы не выжечь GitHub anonymous quota.
- `GITHUB_TOKEN` хранится в Vercel env, используется server-side.

### Reuse

`@npm-pets/core/render-card` (та же satori-функция из v0.3) вызывается на сервере. Шрифты грузятся из `node_modules` единожды на холодный старт.

### Out of scope для v0.4

Юзер-аккаунты, history/snapshots, leaderboard.

### Success criteria

- README-вставка `![](https://npm-pets.dev/card/sfrangulov.svg)` рендерится в GitHub корректно.
- Twitter card validator показывает PNG preview для `https://npm-pets.dev/u/sfrangulov`.
- Холодный старт `/card/<user>.svg` < 3s; кэш-хит < 100ms.

## 7. v0.5 — Ink interactive TUI

### Объём

- Флаг `--interactive`. Старый pretty остаётся default (важно для не-TTY, скриптов, CI).
- Sub-package `npm-pets/tui`, чтобы Ink (и React) не грузился при обычных вызовах.

### Экраны

1. **Overview** — то же содержимое что pretty, но с подсветкой и фокусом.
2. **Package list** — стрелки ↑/↓ для выбора, `/` для search, `Enter` — drill-in, `q` — exit.
3. **Package detail** — sparkline скачек 90d, версия, лицензия, GH stats, `←` назад.

### Технические заметки

- Ink 5.x, React 18.
- Sparklines своими руками в Unicode (`▁▂▃▄▅▆▇█`) — никаких chart-libs.
- Полная клавиатурная навигация, без мыши.

### Out of scope для v0.5

Мышь, vim-кейбиндинги, real-time live-update внутри TUI.

### Success criteria

- `--interactive` запускается за < 500ms на cached данных.
- `--format json` стартует не медленнее, чем v0.4 (Ink не загружается).

## 8. Зависимости и риски

### Технические зависимости

```
v0.2 Insights        →  npm range API (уже используется), GitHub repos API
v0.3 PNG + Persona   →  v0.2 insights, satori, @resvg/resvg-js, Inter font
v0.4 Site            →  v0.3 satori-renderer, Vercel, @npm-pets/core extraction
v0.5 TUI             →  Ink, React (sub-package, lazy)
```

### Риски

| Риск | Митигация |
|---|---|
| satori bundle size раздувает npm-pets | lazy require; `peerDependenciesMeta.optional` |
| @resvg/resvg-js — нативный binding, проблемы с разными платформами | прокачать в CI matrix (linux/mac/win × node 20/22) |
| GH rate-limit на сайте | KV-кэш downloads данных + edge cache + token из env |
| Persona-правила выдают невпечатляющие архетипы у новичков | fallback `The Builder`, протестировать на 20 реальных профилях |
| Монорепо с extracted core ломает существующих пользователей CLI | `npm-pets` остаётся top-level package, реэкспортирует из core |

## 9. Что точно не делаем (на этом этапе)

- AI/LLM features (по-прежнему out of scope из v1 design).
- Ecosystem footprint, bus factor — данные дороги, отдельный трек.
- Year-in-review (`--year`) — вернёмся в декабре, отдельный спринт.
- Leaderboard / global ranking — требует своего корпуса, отдельный трек.
- GitHub Action для static SVG — сайт делает то же без cron'а.
- `--watch`, `--compare`, custom themes, animated PNG.

## 10. Открытые вопросы (для следующего ревью)

1. **`@npm-pets/core` extraction** — делаем сразу в v0.2 или откладываем до v0.4?
2. **Шрифт в карточке** — Inter (нейтрально) или что-то характерное (Geist/JetBrains Mono)?
3. **Persona icon-set** — emoji или SVG-иконки (масштабируется лучше, но больше работы)?
4. **Кэш downloads на сайте** — Vercel KV (платно после free tier) или просто Cache-Control headers?
5. **TUI как отдельный пакет** — `npm-pets/tui` (workspace-subpath) или `npm-pets-tui` (отдельный npm)?

## 11. Out of scope для этого роадмапа (метa)

Сам роадмап покрывает 4 релиза (v0.2 → v0.5). Что после v0.5 — отдельный документ, после ретро по wow-этапу.
