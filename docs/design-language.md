# Mirador Design Language

## About this document

This is the single rulebook for how Mirador looks, feels, behaves and writes; every screen and pull request follows it. It is built in four layers, the structure shared by mature public systems such as [Material Design 3](https://m3.material.io), [Apple's Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines), [Shopify Polaris](https://polaris.shopify.com) and the [GOV.UK Design System](https://design-system.service.gov.uk):

1. **Principles and personality**: the few ideas every decision is checked against.
1. **Foundations**: color, type, spacing, shape, icons, motion. These become design tokens in code.
1. **Components**: the building blocks (buttons, fields, cards, sheets, the quick-add button).
1. **Patterns and content**: how screens behave (navigation, forms, errors, empty states) and how Mirador writes.

### How rules are written

Every rule has a stable ID, like the requirements spec: `DL-<area>-<number>`, for example `DL-COL-03`. Each rule is one sentence of what to do, followed by why. Pull requests and code comments cite the ID, the same way tests cite `BUD-35`. Areas: PRI principles, COL color, TYP type, LAY layout, SHP shape, ICO icons, MOT motion, NUM money and numbers, VIZ charts, VOC voice, CMP components, PAT patterns, A11Y accessibility.

### How it maps to code

- Foundations are **semantic tokens** in Tailwind 4's `@theme` block in `apps/web/src/index.css`, named by role (`surface`, `brand`, `warning`, `danger`), never by hue. Components use the role names only, so every palette works on every screen without a change to the component.
- The palette and the appearance mode are attributes on `<html>`: `data-palette` (for example `data-palette="cami"`) and `data-theme` (`light` or `dark`; none means Automatic). `apps/web/src/lib/appearance.ts` sets them.
- [design-language-palettes.html](design-language-palettes.html) shows every palette on four screens in light and dark.
- Components live in `apps/web/src/components/ui`, built on shadcn/ui and restyled to these tokens.
- The repository copy, `docs/design-language.md`, is the source of truth. `CLAUDE.md` points to it, and changes go through pull requests.

## Principles

Mirador is **cool**: it sits comfortably within what people already know and gently moves it in one direction. It is genuine and unapologetic without shouting for attention, familiar enough to relate to and different enough to stand out. These seven principles turn that into rules. When two choices conflict, the earlier principle wins.

**DL-PRI-01 Polished before plentiful.** A feature ships only when it is finished in every state it can be in: empty, loading, error, offline, light and dark, at 375 px and on desktop, in English and Spanish. *Why:* polish matters more than anything else, and an unfinished state is the first thing people notice.

**DL-PRI-02 Familiar first, distinct second.** Where things are and how they work follow iOS and the big apps people use every day, such as Instagram and WhatsApp: tab bar at the bottom, sheets that slide up, swipe actions on rows, large titles, back at the top left. Originality is spent only on a few signature details, never on reinventing a control. *Why:* people should understand any screen without learning it first. The signature details are what make it feel like Mirador rather than a clone.

**DL-PRI-03 Calm about money.** Mirador states facts and offers a next step. It never alarms, scolds or shames. Going over budget is shown plainly, in a warm tone, never with alarm red, flashing or exclamation marks. Red is reserved for destructive actions, such as deleting. *Why:* a habit-driven budget only works if people keep opening the app, and people avoid apps that make them feel bad.

**DL-PRI-04 Works out of the box.** Every screen is useful with the defaults and needs no setup to get value. Customization makes the app feel like yours; it never asks you to build it. People can change exactly these things and nothing structural:

- an icon and a color for each wallet
- a color for each category group and an icon for each category
- a color for each tag
- a profile picture: their initial or one of Mirador's icons (SYS-18)
- the app's palette and its light or dark mode, from eight designed palettes (DL-COL-01)
- which cards the dashboard shows, and their order (from Mirador's own cards; there is no card builder)
- the app icon, from a few designed options

Colors people pick come from Mirador's curated set, never a free color picker. *Why:* the opposite of "unfinished but highly customizable". A curated set keeps every combination looking designed.

**DL-PRI-05 Confident, not loud.** One clear main action per screen. No confetti, badge counts, streak pressure, pop-ups or dark patterns. The interface steps back and lets the numbers lead. *Why:* "cool" stands out through its differences, not its volume. A quiet interface also reads as more trustworthy with money.

**DL-PRI-06 Crafted, not generated.** Every color, gradient and animation must earn its place by explaining something. No decorative gradients, no stock palette that every other new app uses, no animation that exists only to look busy. *Why:* the "vibe-coded" look (the same gradients, the same purple-and-blue palette, tacky motion) reads as unfinished and untrustworthy, which is the opposite of polished.

**DL-PRI-07 Say it simply.** Show each piece of information in the simplest form that carries it: a number, a short sentence, a bar. A chart or a richer visual appears only when it shows something the simple form cannot, such as a trend in spending analysis. *Why:* if it can't be explained simply, it isn't understood well enough. Every extra line on screen is something people have to read past.

## Personality and feel

Mirador feels **polished, familiar and calm, ****refined with a touch of whimsy**. It should feel like an app Apple might have made for itself, with a few touches Apple wouldn't have thought of. It is a pleasure to look at, never boring and never distracting.

| Mirador is | Mirador is not |
|---|---|
| Polished: every pixel considered | Unfinished but highly customizable |
| Familiar: it works the way your other apps do | Clever controls you have to learn |
| Calm: facts, a next step, a warm tone | Alarming, guilt-tripping, gamified |
| Distinct: a few signature details | "Millennial beige": safe, washed-out, forgettable |
| Crafted: details made for Mirador | "Vibe-coded": stock gradients, the same palette as every other app, tacky animation |
| Native-feeling on iPhone | A web page squeezed onto a phone |
| Solid and clear | Glassy, blurred, "futuristic" |

**References.** The behaviour models are Apple's own iPhone apps (Wallet, Health, Fitness, Weather, Settings) and the big apps everyone knows (Instagram, WhatsApp). The anti-references are Microsoft-style and Linux-style software, where everything is configurable but nothing feels finished.

**Apple, but on the web.** Mirador is a web app, so it can look and behave like iOS but cannot use some Apple assets. Here is how each one is handled:

- **Font:** the device's system font, which is San Francisco on iPhone and Mac (DL-TYP-01).
- **Icons:** Apple's SF Symbols may only be used in apps for Apple platforms, so Mirador uses an open source set drawn in a similar style.
- **Haptics:** Safari on iPhone does not let web apps vibrate, so feedback comes from motion and visual confirmation.
- **App icon:** iPhone reads a web app's icon when it is added to the Home Screen, so the chosen icon applies from the next time it is added.

## Color

**DL-COL-01** People choose the app's palette from eight designed palettes (SYS-17) and its mode: Automatic, Light or Dark (SYS-16). A palette changes only the palette tokens (DL-COL-12); the 12 category colors, `warning`, `danger` and `sun` stay the same in every palette. *Why:* the default reflects one taste, so people get a few finished alternatives, while a color still means the same thing on every screen and in every palette.

**DL-COL-02** No decorative gradients. A gradient is allowed only where it shows a quantity, such as a chart fill, plus the one glow on the hero card (DL-COL-10). The app icon is the one exception (DL-ICO-05).

**DL-COL-03** The default palette is **Sage Grove**: neutrals with a whisper of warm brown, and **Pine**, a deep forest green, as the brand color. In every palette, `brand` marks the main action, the selected tab, switches and links, and `hero` colors the hero card. *Why:* calm and steady, Sage Grove stands out without shouting, and it belongs to the outdoors that the name Mirador comes from.

**DL-COL-04** Screens use color generously but with restraint: the brand color, plus the curated colors of category groups, wallets and tags. A screen with only the brand color and grays is unfinished. *Why:* Mirador is refined but whimsical. Two colors look polished but dull.

**DL-COL-05** Over budget is shown only in words: the amount and the word "over" ("$18 over") take the `warning` color. The bar keeps its category color. `warning` is for gentle cautions like this one; it is outside the curated set, so it never means a category.

**DL-COL-06** Small repeated marks, such as progress bars, use a softer tone of their color (about half strength, mixed with the surface). Icons and text keep the full color. *Why:* many full-strength bars on one screen compete for attention.

**DL-COL-07** Money in (income, refunds) takes the Moss color with its plus sign. Every other amount uses the text color, including negative wallet balances (DL-NUM-03). Red (`danger`) is used only for destructive actions, such as deleting.

**DL-COL-08** A tile's background is its color mixed with the surface at 14% (light) or 22% (dark). A bar is its color mixed with the surface at 52% (light) or 64% (dark).

**DL-COL-09** `sun`, a golden color, marks goals, milestones and good moments, and nothing else, in every palette. *Why:* used rarely, it stays a small reward.

**DL-COL-10** The hero card carries one soft glow from its top-right corner in the palette's `glow` color: 24% opacity, 10% at 40% of the way, gone by 78%. Paper has no glow. It is the only decorative gradient in Mirador. *Why:* it gives the one loud element on the screen its palette's light (sunlight in Sage Grove, an aurora in Glacier) without becoming a pattern.

### App tokens

**DL-COL-12** Each palette sets the 13 palette tokens below; the shared tokens and the category colors are the same in every palette. In every palette and mode, `text` and `text-muted` reach 4.5:1 on `background` and `surface`, `on-brand` and `on-hero` reach 4.5:1 on `brand` and `hero`, `brand` reaches 3:1 on `surface`, and `warning` reaches 4.5:1 and `sun` and every category color 3:1 on `background` and `surface` (WCAG 2.2 AA). `text-faint` is only for disabled controls. A test checks every palette.

| Token | Used for | Set by |
|---|---|---|
| `background` | Screen behind cards | Palette |
| `surface` | Cards, lists, tab bar, sheets | Palette |
| `inset` | Fields inside a sheet | Palette |
| `text` | Main text and amounts | Palette |
| `text-muted` | Secondary text, cents, labels, inactive tabs | Palette |
| `text-faint` | Disabled controls only | Palette |
| `separator` | Hairlines between rows | Palette |
| `fill` | Empty part of bars, segmented controls | Palette |
| `brand` | Quick-add, selected tab, switches, links, focus ring | Palette |
| `on-brand` | Text and icons on brand | Palette |
| `hero` | Hero card background | Palette |
| `on-hero` | Text on the hero card | Palette |
| `glow` | The hero card's glow (DL-COL-10) | Palette |
| `warning` | Over budget and other gentle cautions | Shared |
| `danger` | Destructive actions only | Shared |
| `sun` | Goals, milestones, good moments | Shared |
| `on-sun` | Text on sun | Shared |

### Shared tokens

| Token | Light | Dark |
|---|---|---|
| `warning` | #B54E1A | #F2935C |
| `danger` | #BF322B | #FF6B5F |
| `sun` | #B87A06 | #E8B24A |
| `on-sun` | #2A1D00 | #231800 |

### Palettes

In the order the palette picker shows them. The id is the value of `data-palette`.

#### Paper

Id `paper`. Plain black and white with no personality, like Apple's own apps. The hero card has no glow.

| Token | Light | Dark |
|---|---|---|
| `background` | #F2F2F7 | #000000 |
| `surface` | #FFFFFF | #1C1C1E |
| `inset` | #F2F2F7 | #2C2C2E |
| `text` | #1C1C1E | #F2F2F7 |
| `text-muted` | #6C6C70 | #98989F |
| `text-faint` | #AEAEB2 | #5A5A5E |
| `separator` | #3C3C43 at 12% | #EBEBF5 at 13% |
| `fill` | #3C3C43 at 6% | #EBEBF5 at 8% |
| `brand` | #1C1C1E | #F2F2F7 |
| `on-brand` | #FFFFFF | #000000 |
| `hero` | #1C1C1E | #2C2C2E |
| `on-hero` | #FFFFFF | #F2F2F7 |
| `glow` | none | none |

#### Sage Grove (default)

Id `sage-grove`. Neutrals with a whisper of warm brown and Pine, a deep forest green, with sunlight through the trees on the hero. The default.

| Token | Light | Dark |
|---|---|---|
| `background` | #F3F2EF | #0A0A09 |
| `surface` | #FFFFFF | #191917 |
| `inset` | #F3F2EF | #242321 |
| `text` | #1D211A | #EEF1EA |
| `text-muted` | #656C5F | #9CA595 |
| `text-faint` | #A9AEA3 | #5D6657 |
| `separator` | #23281C at 12% | #E1EBD7 at 13% |
| `fill` | #23281C at 6% | #E1EBD7 at 8% |
| `brand` | #3D6B45 | #4E9E5C |
| `on-brand` | #FFFFFF | #06140A |
| `hero` | #3D6B45 | #1E4527 |
| `on-hero` | #FFFFFF | #EEF1EA |
| `glow` | #FFCE6E | #FFCE6E |

#### Cami

Id `cami`. Soft pastels: a pink hero with a lilac glow and rose buttons, because looking at your finances is stressful enough and soft colors are calming.

| Token | Light | Dark |
|---|---|---|
| `background` | #FAF4F6 | #0C0A0B |
| `surface` | #FFFFFF | #1D181B |
| `inset` | #F7EEF2 | #2A2327 |
| `text` | #2A1D24 | #F7ECF1 |
| `text-muted` | #7A6670 | #B39DA8 |
| `text-faint` | #BBA9B2 | #6A5862 |
| `separator` | #3A2430 at 12% | #F5E1EA at 13% |
| `fill` | #3A2430 at 6% | #F5E1EA at 8% |
| `brand` | #D46A98 | #F0A0C4 |
| `on-brand` | #3A0F24 | #3A0F24 |
| `hero` | #F6D2E0 | #4E2A3E |
| `on-hero` | #4A1A33 | #FBEAF2 |
| `glow` | #B9A4F2 | #B9A2F0 |

#### Coronado

Id `coronado`. Sun and sand: sand neutrals, a turquoise sea and a sun glow, after the beaches of Cancún and San Diego.

| Token | Light | Dark |
|---|---|---|
| `background` | #F4F1EA | #070A0B |
| `surface` | #FFFFFF | #151B1C |
| `inset` | #F1EDE4 | #20282A |
| `text` | #1A2427 | #E9F2F2 |
| `text-muted` | #5F6B6D | #93A6A8 |
| `text-faint` | #A6AEAF | #566467 |
| `separator` | #1F2E30 at 12% | #DDEDED at 13% |
| `fill` | #1F2E30 at 6% | #DDEDED at 8% |
| `brand` | #0B6E7A | #3FB7C2 |
| `on-brand` | #FFFFFF | #02181B |
| `hero` | #0B6E7A | #0C4A52 |
| `on-hero` | #FFFFFF | #E9F6F6 |
| `glow` | #FFD27A | #FFD27A |

#### Glacier

Id `glacier`. An icy tundra: cool blue-white neutrals, glacier blue and an aurora glow.

| Token | Light | Dark |
|---|---|---|
| `background` | #EEF2F6 | #07090C |
| `surface` | #FFFFFF | #151A21 |
| `inset` | #EBF0F5 | #1F2630 |
| `text` | #17202B | #EAF1F8 |
| `text-muted` | #5E6B7A | #95A3B3 |
| `text-faint` | #A5AFBB | #566273 |
| `separator` | #1F2B38 at 12% | #DDE7F2 at 13% |
| `fill` | #1F2B38 at 6% | #DDE7F2 at 8% |
| `brand` | #2F5F8A | #7FB2E5 |
| `on-brand` | #FFFFFF | #061526 |
| `hero` | #24496E | #1A3452 |
| `on-hero` | #FFFFFF | #EAF1F8 |
| `glow` | #6FE3C1 | #5FD6B4 |

#### Mesa

Id `mesa`. The desert: warm sand, terracotta and a sunset glow.

| Token | Light | Dark |
|---|---|---|
| `background` | #F6F0E7 | #0B0908 |
| `surface` | #FFFFFF | #1C1816 |
| `inset` | #F2EADF | #28221E |
| `text` | #2A1F17 | #F5EDE4 |
| `text-muted` | #7A6A5B | #B0A090 |
| `text-faint` | #B9AB9C | #6B5E52 |
| `separator` | #3A2A1D at 12% | #F2E4D6 at 13% |
| `fill` | #3A2A1D at 6% | #F2E4D6 at 8% |
| `brand` | #A5502F | #E08A63 |
| `on-brand` | #FFFFFF | #2A0E03 |
| `hero` | #A5502F | #5A2A1A |
| `on-hero` | #FFFFFF | #F8ECE2 |
| `glow` | #F4B860 | #F4B860 |

#### Jacaranda

Id `jacaranda`. The purple of the jacaranda trees that bloom across Mexico City in spring, with a blossom-pink glow.

| Token | Light | Dark |
|---|---|---|
| `background` | #F5F3F8 | #09080C |
| `surface` | #FFFFFF | #18161D |
| `inset` | #F0EDF5 | #24212B |
| `text` | #211C2A | #EFECF5 |
| `text-muted` | #6B6478 | #A49CB5 |
| `text-faint` | #ADA6BA | #5F586D |
| `separator` | #2A2238 at 12% | #E6E0F2 at 13% |
| `fill` | #2A2238 at 6% | #E6E0F2 at 8% |
| `brand` | #6A4FB0 | #A58DEB |
| `on-brand` | #FFFFFF | #160B33 |
| `hero` | #6A4FB0 | #35265E |
| `on-hero` | #FFFFFF | #F1ECFB |
| `glow` | #F2B8D8 | #E9A6CF |

#### Sierra

Id `sierra`. A stony mountain: granite grays, a slate hero and a pale glow like light on snow.

| Token | Light | Dark |
|---|---|---|
| `background` | #F1F0EE | #09090A |
| `surface` | #FFFFFF | #18191B |
| `inset` | #E9E8E5 | #232528 |
| `text` | #1E2124 | #EDEEF0 |
| `text-muted` | #62666A | #9DA2A8 |
| `text-faint` | #A9ACAF | #5B6066 |
| `separator` | #2A2E33 at 12% | #E2E5EA at 13% |
| `fill` | #2A2E33 at 6% | #E2E5EA at 8% |
| `brand` | #505B66 | #AEB8C2 |
| `on-brand` | #FFFFFF | #111519 |
| `hero` | #5A626B | #363C43 |
| `on-hero` | #FFFFFF | #EDEEF0 |
| `glow` | #E4ECF4 | #C9D6E3 |

### Category colors

The 12 colors people can choose for wallets, category groups and tags, in the order the color picker shows them.

**DL-COL-11** Category colors color icons, bars and color dots. Text uses them only for money in (Moss, DL-COL-07). *Why:* in light mode Marigold and Meadow reach 3:1, enough for shapes but not for text; a yellow dark enough for text turns brown.

**DL-COL-13** Category colors belong to categories, category groups, wallets and tags, and to what shows them: their tiles, bars, dots and chart series. The app itself never uses them: its own tiles (Settings rows, empty states, the profile picture) take `brand`, and everything else takes the palette tokens. Money in keeps Moss (DL-COL-07). *Why:* when a color can mean either a category or the app, it stops meaning anything, and the app should look like its palette.

| Name | Light | Dark |
|---|---|---|
| Clay | #C1462D | #E18E7D |
| Bark | #86613E | #CC9F74 |
| Marigold | #A98200 | #F0C42E |
| Meadow | #6B9325 | #9CC842 |
| Moss | #437A2C | #8BC56B |
| Lagoon | #12807F | #5CCAC4 |
| Lake | #2A74AB | #74B3E6 |
| Dusk | #2C5397 | #7096D8 |
| Heather | #7A5CBD | #B59FF0 |
| Plum | #94459A | #CB8FCF |
| Berry | #B93D6C | #EF88AE |
| Stone | #63707A | #A4B1B8 |

## Typography

**DL-TYP-01** Mirador uses the device's system font: `font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. No web fonts are downloaded. *Why:* the app should feel like it belongs on whatever device it runs on, with no loading flash, and no font service is contacted (NFR-05).

**DL-TYP-02** Every amount uses tabular numerals (`font-variant-numeric: tabular-nums`), so digits have equal widths and columns of amounts line up.

**DL-TYP-03** Text uses only these styles. Line height is 1.4 unless noted.

| Style | Size | Weight | Tracking | Used for |
|---|---|---|---|---|
| Large title | 30 px | 700 | −0.02em | Screen title |
| Hero amount | 46 px (sign and cents 23 px) | 600 (sign and cents 500) | −0.03em | The one hero amount (DL-NUM-01) |
| Headline | 17 px | 600 | 0 | Card titles, sheet titles |
| Body | 15 px | 400 | 0 | Rows, amounts, text |
| Secondary | 13 px | 400 | 0 | Second line of a row, notes, "left" and "over" |
| Section label | 12 px, uppercase | 400 | +0.04em | Labels above groups, in `text-muted` |
| Tab label | 10 px | 500 | 0 | Tab bar |

## Layout and spacing

**DL-LAY-01** Navigation on a phone is a bottom tab bar. Tabs are places, never actions.

**DL-LAY-02** Quick-add is a round floating button that sits beside the tab bar, on the side of the thumb, on every screen. *Why:* Apple's guidelines keep actions out of the tab bar, and Apple's own apps now place a separate button next to it. That button is always within reach of one thumb.

**DL-LAY-03** All spacing comes from one scale: 4, 8, 12, 16, 24, 32 px.

**DL-LAY-04** On a phone, screens have 16 px side margins and 12 px between groups. Cards have 14 px top and bottom padding and 16 px side padding. A list row is at least 52 px tall, so every tap target is well over 44 px.

**DL-LAY-05** Content is grouped into cards and lists on the `background`, each group introduced by a section label.

**DL-LAY-06** The layout follows the screen width:

| Width | Layout |
|---|---|
| Under 768 px (phones) | Everything above. |
| 768 to 1023 px (tablets) | Same tab bar. Content in one centered column, at most 640 px wide. Sheets become centered dialogs, at most 540 px wide. |
| 1024 px and up (large tablets, computers) | A sidebar on the left replaces the tab bar, with the same places in the same order and the quick-add button at its top as a filled "New" button. Content is at most 720 px wide; Home may place its cards in two columns. |

*Why:* this is how iPadOS and macOS apps adapt: the same places, presented as a sidebar when there is room.

## Shape and depth

**DL-SHP-01** Surfaces are solid. No translucency, background blur or glass effects (Apple's Liquid Glass included), on bars, sheets or cards. *Why:* numbers stay crisp to read, cheaper phones stay fast, and the look won't date the way "futuristic" styles do.

**DL-SHP-02** Corner radius by element:

| Element | Radius |
|---|---|
| Cards and lists | 16 px |
| Buttons | 14 px |
| Icon tiles | 10 px |
| Sheets (top corners) | 22 px |
| Tab bar | Fully rounded |
| Quick-add button | Circle |
| Bars | Fully rounded |

**DL-SHP-03** Cards and lists have no shadow and no border. They stand apart from the `background` by their `surface` color alone. Only floating elements are lifted: the tab bar (a hairline outline), the quick-add button and sheets (a soft shadow).

**DL-SHP-04** Rows in a list are divided by hairline separators that start where the text starts, not under the icon.

## Icons and illustration

**DL-ICO-01** Mirador never uses emoji in its interface. Categories, wallets and navigation use minimalist icons: simple shapes, little detail, recognizable at a glance.

**DL-ICO-02** A category or wallet is shown as an icon tile: its icon in its color, on a rounded square tinted with that same color.

**DL-ICO-03** The icon set is [Phosphor](https://phosphoricons.com) (MIT license). Duotone appears only inside tiles: category and wallet tiles in their color, and the app's own tiles and profile picture in `brand` (DL-COL-13). Everything else uses the Regular (line) style: buttons, the quick-add plus, chevrons, swipe actions and banners. The selected tab uses Fill, as iOS does. Inside a tile, use only icons whose second tone shades a part of the drawing that the drawing's own outline closes in, such as the inside of a card, a cup or a circle. If the second tone is a box or circle behind the drawing, or spills past the lines, as between the two arrows of Repeat, pick another icon: an arrow in a circle for transfers, arrows around a circle for recurring, bars for investments. A tile that pictures another app's button, such as the browser's Share button in the install steps, draws it in Regular, as it looks there. *Why:* shading that nothing encloses reads as a rendering glitch, not as shading.

**DL-ICO-04** Icon tiles are 34 px with a 20 px icon. Tab bar icons are 23 px.

**DL-ICO-05** **App icon.** The app icon is **Coin stacks**: three stacks of gold coins growing like a chart, on a white tile, or a near-black one in dark mode. It keeps its own colors in every app palette. Unlike the interface, it may use shading and highlights, as Apple's own app icons do. The masters are `docs/brand/app-icon.svg` and `docs/brand/app-icon-dark.svg`; the web app serves its copies from `apps/web/public`. The options that were considered are kept in [app-icon.html](app-icon.html). *Why:* people should know it is a money app at a glance, the way Notes looks like a notepad and Wallet looks like cards.

## Motion and feedback

**DL-MOT-01** Motion confirms what happened and shows where things went. It never decorates.

**DL-MOT-02** Saving a transaction plays one short sequence: the Save button turns into a check, the sheet slides away, and the new row opens into its list with a highlight that fades. The whole sequence takes under one second.

**DL-MOT-03** No animation blocks input. The next action, such as opening quick-add again, works the moment it is tapped, even while the previous animation is finishing. *Why:* people log expenses in a hurry. Motion that makes them wait stops being a flourish and becomes an obstacle.

**DL-MOT-04** People can turn animations off for the whole app in Settings. The setting starts from the device's own Reduce Motion setting. With animations off, every change happens instantly and nothing else changes.

**DL-MOT-05** Timing for the save sequence (DL-MOT-02):

| Step | Duration | Easing |
|---|---|---|
| Save turns into a check | 260 ms | `cubic-bezier(.32,.72,0,1)` |
| Sheet slides away | 420 ms | `cubic-bezier(.32,.72,0,1)` |
| New row opens into the list | 360 ms | `cubic-bezier(.32,.72,0,1)` |
| Row highlight fades | 1.4 s | ease-out, runs in the background |

**DL-MOT-06** Screens move like iOS: a new screen slides in from the right and back slides it out, a sheet slides up from the bottom over a dimmed background, all with the system's spring timing (about 350 ms). Closing slides the sheet back down (350 ms). From 768 px, where a sheet is a centered dialog, it fades and grows in (250 ms) and closes with a quick 150 ms fade. The screen under a closing sheet answers the next tap at once (DL-MOT-03). With animations off (DL-MOT-04), they fade instead. Switching tabs doesn't move anything.

**DL-MOT-07** Everything else that changes in place moves too, quickly, with the same curve (`cubic-bezier(.32,.72,0,1)`), so the person sees where it went:

| What | Duration |
|---|---|
| Rows that open and close in place: "Show all", a date or day picker, a part of a form that appears | 300 ms |
| The segmented control's thumb slides to the option tapped | 250 ms |
| Rows moved in a list, such as reordering wallets, slide to their new place | 250 ms |
| The undo banner rises into place, and fades away | 250 ms in, 150 ms out |
| A missing field shakes when Save is tapped (DL-PAT-02) | 300 ms, `ease-out` |

The save sequence (DL-MOT-02) plays for every Save that adds or changes something, not only transactions: a new wallet or transaction row opens into its list with its highlight. With animations off (DL-MOT-04), nothing moves: rows appear and go at once, and missing fields don't shake.

## Money and numbers

**DL-NUM-01** A screen has at most one hero amount: the number the screen exists to show, such as net worth on Wallets. The whole units are set large and heavy. The currency sign and the cents are set at half that size, in the muted text color. *Why:* the one number that matters stands out and doesn't get lost among the others.

**DL-NUM-02** Amounts in lists keep the same structure at body size: whole units in the text color, cents in a smaller muted size.

**DL-NUM-03** Signs mark only what is unusual for where the amount appears:

| Where | Usual case | Unusual case |
|---|---|---|
| Transactions | Expense: no sign, text color ("$4.50") | Income or refund: plus sign in Moss ("+$1,200.00") |
| Transfers between own wallets | No sign, `text-muted` ("$2,000.00"), with the row's second line reading "Checking → Credit card" | (none) |
| Wallet balances and net worth | Positive: no sign | Negative (a credit card, a loan): minus sign, text color ("−$3,250.00") |
| Budget | "$212 left" | "$18 over" in `warning` (DL-COL-05) |

A day's or a period's net follows the same rule: money in shows its plus in Moss, money out shows no sign.

*Why:* the usual case needs no decoration; a sign or color only appears when it tells you something. A transfer is muted because it is neither spending nor income: money only moved between your own wallets.

**DL-NUM-04** The minus sign is the true minus (−, U+2212), never a hyphen. *Why:* it is as wide as the plus and lines up in columns.

**DL-NUM-05** Amounts are formatted for the app language (`en-US` or `es-MX`) by the platform's number formatter, never by hand. Amounts always show cents in lists and forms, and full grouped numbers ("$12,480.50"). Short forms ("$12.5K", "12.5 mil") appear only on chart axes.

**DL-NUM-06** Amounts in the main currency show only its symbol. Amounts in any other currency show their code after the number ("120.00 USD"). *Why:* in Mexico, pesos and dollars both use "$".

**DL-NUM-07** Percentages are whole numbers ("44%"). Below 1% show "<1%".

**DL-NUM-08** Dates in lists are relative while they are recent: "Today", "Yesterday", then the weekday within the last week, then "Oct 3" ("3 oct" in Spanish). The year appears only when it is not the current year. Months are lowercase in Spanish.

## Charts and data visualization

**DL-VIZ-01** Progress toward a goal or a budget is a bar plus one plain sentence ("$4,400 of $10,000"). It is never a chart (DL-PRI-07).

**DL-VIZ-02** A chart about categories, wallets or tags uses their own colors, so a color means the same thing on every screen. A chart with one series uses `brand`.

**DL-VIZ-03** A phone chart shows at most six series; the rest are grouped as "Other" in `text-faint`. Labels sit on or next to the data, not in a separate legend, wherever they fit.

**DL-VIZ-04** Bars and lines are flat. The only gradient allowed is an area fill under a line, fading to transparent (DL-COL-02).

## Voice and tone

**DL-VOC-01 Plain and warm.** Mirador talks like a calm friend who is good with money: short sentences, everyday words, the facts first. "You're $18 over on Eating out." Never "Warning: budget exceeded."

**DL-VOC-02 Whimsy, once in a while.** A light, playful line is allowed only in empty states and milestones, such as a first transaction or a goal reached. Never in errors, amounts, buttons or anything about overspending. *Why:* simple most of the time keeps the app fast to read; the occasional smile is what makes it feel like Mirador.

**DL-VOC-03 Spanish uses tú.** Every Spanish string addresses the person as tú, never usted or vos.

**DL-VOC-04 Spanish is written for Mexico first.** Vocabulary follows Mexican Spanish, then stays understandable across Latin America and Spain. Avoid words that only exist in Spain (ordenador, móvil, vale) and Mexican slang. The Spanish locale is `es-MX`.

| Use | Avoid |
|---|---|
| celular | móvil |
| computadora | ordenador |
| listo, de acuerdo | vale |

**DL-VOC-05** Buttons say exactly what happens, as a verb: "Save", "Guardar". Confirmations repeat it in the past: "Saved", "Guardado".

**DL-VOC-06** **Glossary.** The spec's terms always use these words:

| English | Spanish (México) |
|---|---|
| Wallet | Cartera |
| Category group | Grupo de categorías |
| Category | Categoría |
| Tag | Etiqueta |
| Transaction | Movimiento |
| Income | Ingreso |
| Expense | Gasto |
| Transfer | Transferencia |
| Budget | Presupuesto |
| Goal | Meta |
| Net worth | Patrimonio |
| Recovery key | Clave de recuperación |

**DL-VOC-07** **Slogan.** "Know where you stand. See where you're going." In Spanish: "Conoce dónde estás. Mira a dónde vas." It appears under the name where Mirador introduces itself. *Why:* the first half is your wallets and spending today, the second is your goals, which is the whole app in two sentences.

## Components

**DL-CMP-01 Hero card.** At most one per screen, at the top. It is filled with `hero` and holds the screen's hero amount (DL-NUM-01) in `on-hero`, with its label and one line of context. It is the only loud element on the screen; everything around it stays quiet.

**DL-CMP-02 Icon tile.** A Duotone icon in its color on a tinted rounded square (DL-ICO-02, DL-COL-08, DL-ICO-04). A tile that belongs to the app rather than a category, such as a Settings row, uses `brand` (DL-COL-13).

**DL-CMP-03 Progress row.** Icon tile, name, and "$212 left" or "$18 over" on the first line; a 5 px bar in the category's softer tone below (DL-COL-05, DL-COL-06).

**DL-CMP-04** **Quick-add button.** A 54 px circle in `brand` with a plus in `on-brand`, beside the tab bar (DL-LAY-02).

**DL-CMP-05** **Buttons.** Three styles, as in iOS:

- **Filled** (`brand` with `on-brand` text): the one main action of a screen or sheet, such as Save. Never two on one screen.
- **Tinted** (`brand` at 14% on the surface, `brand` text): a second action next to it, such as "Save & new".
- **Plain** (`brand` text, no background): actions in the navigation bar and inside lists.

Full-width buttons are 50 px tall; any button is at least 44 px. A destructive button uses `danger` text, plain or tinted, never filled. The label is a verb (DL-VOC-05).

**DL-CMP-06** **Navigation bar.** Each tab opens with a large title. The tab's actions share the title's row on the right, as in the App Store: on every tab that is the profile picture, 40 px, which opens Settings. No row is spent on buttons alone. Once the page scrolls, the title shrinks into the bar, centered. A screen reached from another, such as a Settings page, has a round back button at the top left: a 44 px `surface` circle with a chevron only, as in iOS Settings (its accessible name is the previous screen's title). Instead of the large title it opens with a header card: a `surface` card holding a 56 px icon tile (or, for Account, the profile picture), the screen's title in 24 px bold and one short line in `text-muted` on what you can do there. At most two plain actions sit at the top right.

**DL-CMP-07** **List rows.** Rows sit in inset lists (a `surface` card with 16 px corners), at least 52 px tall: icon tile, title, an optional second line in `text-muted`, and a value or amount on the right. A chevron appears only when the row opens another screen. Tapping a row opens it, which is also where it is edited. A transaction row never says its type: its amount does (DL-NUM-03). Its title is the payee, else the note, else the category; the second line holds the category when the title is something else, then the wallet. Swiping a row to the left is only for deleting, as in iOS. A short swipe slides the row aside and leaves a small red Delete pill showing; tapping the pill deletes the row. A long swipe deletes it straight away. Tapping anywhere else closes the pill. Delete can also be reached from the row's own screen (DL-A11Y-07).

**DL-CMP-08** **Sheets.** Creating or editing something opens a sheet that slides up, with a grabber, Cancel at the top left, the title in the middle, and the main action as a filled button at the bottom, within reach of the thumb. Settings-like sheets put Done at the top right instead. On a phone, the sheet follows the finger down and closes when let go far or fast enough. The pull starts from the grabber and title bar at any time, and from the content once it is scrolled to the top. A sheet with unsaved changes springs back instead and an action sheet asks "Discard changes?". Cancel stays too, as in iOS: not everyone knows the gesture, and it is the only way out on a computer.

**DL-CMP-09** **Fields.** Fields are rows in an inset list, as in iOS Settings: label on the left, value on the right, chevron when it opens a picker. Free text fields use the `inset` fill. The amount is entered as a big number with the decimal keypad. A field's error appears right under it in `warning` (DL-PAT-05), only after Save was tapped (DL-PAT-02). A field being typed in shows only its caret, in `brand`, never a box around it, as in iOS. What a field is for goes in a short hint right under it, never behind an (i) button. Rules a value must meet, such as a password's, appear as a checklist under the field once it is used, tick off as they are met and fold away only when all are met, never when the field loses focus, so nothing under them moves while the finger reaches for it.

- **Money.** Every field that holds an amount groups the digits as they are typed, the way the language writes them ("25,000"), and shows the cents still to come in `text-faint` (".00"). Typed cents take the normal text color. The field is as wide as its text, so the faint cents sit right beside it.
- **Other numbers.** A rate, a percent, an exchange rate or a count of months is a plain number: no faint decimals, which belong to money only. Its placeholder is a faint "0".
- **Dates and days.** A date, month, year, day of the week or day of the month is picked, never typed. The row shows the value in a small `fill` pill; tapping it opens the picker right under the row, as iOS forms do: a calendar a month at a time (the chosen day a filled `brand` circle, today in `brand`), or the days 1 to 31 in a grid. Picking closes it.

**DL-CMP-10** **Switches and checks.** A single option that is on or off, such as "Leave out of the budget" or a wallet's features, is the iOS switch: a `brand` track when on, a soft gray one when off, and a white knob that slides across. It is a switch whether it takes effect at once or with the form's Save, as in iOS's own New Event sheet. A check mark in `brand` is only for picking from a list: one item (the sort order, a category) or several (the tags on a transaction, the types in a filter).

**DL-CMP-11** **Segmented control.** Two to five equal options that switch a mode or a view, such as Expense, Income and Transfer. More than five becomes a list. The selected option sits on `thumb`: `surface` in light mode, and in dark mode `surface` mixed with 24% `text`, so it stands out from the track as in iOS.

**DL-CMP-12** **Action sheet.** Confirms a destructive or irreversible step. It slides up, states the consequence in one sentence, and offers the destructive action in `danger` with Cancel set apart below it.

**DL-CMP-13** **Undo banner.** After a delete that can be undone: one line and an Undo button, on `surface`, just above the tab bar, for 5 seconds. Only one at a time.

**DL-CMP-14** **Empty state.** A large icon tile, a short title, one sentence on what will appear here, and the filled button that fills it ("Add a wallet"). This is a place for a touch of whimsy (DL-VOC-02).

**DL-CMP-15** **Show more.** A long list of options that are mostly off, such as a wallet's features, shows only the ones that are on, then a last row in `brand` with a chevron pointing down: "Show all features". Opened, it shows every option and the row reads "Show fewer". An option turned off stays in view until the list is folded again, so a row never vanishes under the finger. A long list of choices, such as currencies, shows the common ones and the chosen one, then "Show all currencies". A list of items, such as transactions, shows the latest few (5 on a phone, 10 from 768 px) and a "See more" row that opens the full list on its own screen.

## Patterns

**DL-PAT-01** **Navigation.** The tabs are Home, Transactions, Budget and Wallets. Opening an item pushes a screen in from the right, and swiping from the left edge goes back. Creating or editing opens a sheet (DL-CMP-08). Tapping the current tab returns to its top. Settings is not a place, so it is not a tab: it opens from the profile picture beside each tab's title, or from the bottom of the sidebar (DL-LAY-06). It lists Account, then Appearance, Password and security, and Invites for the person who runs the server, then Lock and Sign out; more areas join as they are built.

**DL-PAT-02** **Forms.** Fill in everything that can be guessed: today's date, the last wallet used, the suggested category. Show the required fields first. Check the fields only when the person taps the main button, never while they type or when they leave a field. The main button always looks ready. Tapped with a required field missing, it saves nothing: each missing field gives a quick small shake (DL-MOT-07), gets a `warning` outline and its error under it, and the caret goes to the first one. From then on each mark clears as soon as its field is filled. *Why:* a warning for a field the person hasn't reached yet feels like being scolded for something they were about to do.

**DL-PAT-03** **Empty states.** Every list and screen that can be empty has an empty state (DL-CMP-14). It is never a blank screen.

**DL-PAT-04** **Loading.** Data comes from the device, so screens appear at once with their content. Only waits on the server (sign-in, sync, reading a receipt) show progress: a small spinner in place, appearing only after 300 ms, never a full-screen block.

**DL-PAT-05** **Errors.** An error says what happened and what to do next, in plain words, where it happened: under the field, on the row, or in a banner for the whole app. It uses `warning`, never `danger`. No error codes, no "Oops", no blame. Example: "That date is in the future. Pick today or earlier."

**DL-PAT-06** **Confirm or undo.** Deleting one thing happens at once and shows the undo banner (DL-CMP-13). Deleting something that takes other data with it, such as a wallet with its transactions, first shows an action sheet that names the cost ("This deletes 48 transactions."). Reversible actions are never confirmed.

**DL-PAT-07** **Offline.** A slim banner under the navigation bar says "You're offline. Changes will sync when you're back." Quick-add keeps working. Anything that needs the server is disabled with a one-line reason, never hidden.

**DL-PAT-08** **Saved.** A normal save shows only the brief save animation (DL-MOT-02). No "Saved!" message.

## Accessibility

**DL-A11Y-01** Text meets 4.5:1 contrast, and icons, bars and controls meet 3:1, in light and dark.

**DL-A11Y-02** Text sizes follow the person's text size setting (sizes in `rem`), and every screen still works at 200%: text wraps, nothing is cut off.

**DL-A11Y-03** Color is never the only signal: over budget says "over", income has a plus sign, errors have words.

**DL-A11Y-04** Every icon-only button has a spoken label. Icon tiles beside a text label are hidden from screen readers.

**DL-A11Y-05** Every tap target is at least 44 px, and nothing depends on hover.

**DL-A11Y-06** Keyboard focus is always visible: a 2 px `brand` ring.

**DL-A11Y-07** Every gesture (swipe actions, swipe back, swipe to close) has a visible tap alternative.

**DL-A11Y-08** Animations follow the device's Reduce Motion setting and the in-app switch (DL-MOT-04).

