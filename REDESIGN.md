# CHECKNI TO — Redesign „Aurora“

> Cíl (zadání): Stránka je teď přehledná, ale plochá a jednoduchá. Chci **komplexní, prémiový design, který zaujme**, zůstane ale **přehledný a všechno dává smysl**. Menu se může přesunout jinam.

Tento dokument je plán. Implementace postupuje přesně podle něj a odškrtává hotové body.

---

## 1. Designová vize

Z plochého „světlého admin“ vzhledu uděláme **moderní, vrstvený, prémiový produktový dashboard**:

- **Aurora pozadí** – jemný barevný mesh-gradient (indigo → violet → sky) v rozích nad téměř bílým podkladem. Dává hloubku, ale nepřebíjí obsah.
- **Vrstvené povrchy** – bílé karty s jemným borderem, měkkými vícevrstvými stíny, většími rádii (rounded-2xl / 3xl). Klíčové prvky jako „glass“ s `backdrop-blur`.
- **Boční navigace (sidebar)** místo horního navbaru = hlavní změna rozložení („menu jinde“). Moderní app-shell.
- **Silnější typografická hierarchie** – velké nadpisy (Geist), méné всudypřítomného `uppercase tracking-widest`. Velká písmena jen pro mikro-labely.
- **Bohaté stat karty** – ikonové „chipy“, gradientní akcenty, velká čísla, kontext (trend / popisek).
- **Mikro-interakce** – jemné hover/active stavy, plynulé přechody, decentní animace.

Vše je **jen prezentační vrstva**. Veškerá logika (fetch, state, handlery, OCR, AI chat, výpočty) zůstává beze změny.

### Barevný systém (sémantika)
- **Primární / značka:** indigo-600 `#4f46e5` → violet-600 gradient
- **Present / úspěch:** emerald
- **Alert / odchod / mazání:** rose
- **Warning / pauza / oběd:** amber
- **Info / lékař:** sky
- **Neutrály:** slate (správné odstíny 50–950)

### Pravidlo: opravit neplatné Tailwind odstíny
Kód obsahuje halucinované třídy (`slate-450`, `indigo-650`, `emerald-250`, `sky-855`, `amber-808`, `slate-555`…), které nic nedělají. Při úpravách je nahrazujeme platnými (50,100,…,900,950).

---

## 2. Design tokeny & utility (`app/globals.css`)

Přidat (přes `@layer components` / `@layer utilities` + CSS proměnné):

- [x] CSS proměnné: brand, gradient stops, povrchy, border, ring, stíny.
- [x] `.app-bg` – aurora mesh pozadí (fixed pseudo-elementy s radiálními gradienty).
- [x] `.surface` / `.surface-2` – základní karta (border, stín, radius).
- [x] `.glass` – průhledná karta s blur.
- [x] `.card-accent` – moderní náhrada za `h-1 bg-indigo-600` proužek (gradient + glow).
- [x] `.stat-card` – bázový styl pro KPI dlaždice.
- [x] `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-soft`.
- [x] `.input`, `.select`, `.field-label`.
- [x] `.chip` + varianty (`.chip-indigo/emerald/amber/rose/sky/slate`).
- [x] `.section-title`, `.eyebrow` (mikro-label).
- [x] `.tab` / `.tab-active` (podtržené taby).
- [x] Custom scrollbar (tenký, decentní).
- [x] Animace: `fade-in`, `rise`, `pulse-dot`, `shimmer` (skeleton).

---

## 3. Navigace + App Shell

- [x] **`app/components/Sidebar.tsx`** – fixní levý sidebar (desktop), překryvný drawer (mobil).
  - Brand (logo + název), navigační položky s ikonami, aktivní = gradient pill se „glow“.
  - Dole: profil uživatele (jméno, role badge) + odhlášení.
  - Filtrace položek podle role (EMPLOYEE vidí jen Portál) – stejná logika jako dnešní Navbar.
- [x] **`app/components/AppShell.tsx`** – klientský wrapper:
  - `/login` → jen children (samostatná obrazovka).
  - `/kiosk` → jen children (fullscreen nástěnný terminál, vlastní header).
  - ostatní → sidebar + hlavní obsah (`lg:pl-[var(--sidebar-w)]`) + mobilní top-bar s hamburgerem + aurora pozadí.
- [x] **`app/layout.tsx`** – nahradit `<Navbar/>` za `<AppShell>{children}</AppShell>`.
- [x] Starý `Navbar.tsx` necháme (nepoužitý) nebo smažeme – preferenčně odstranit import.

---

## 4. Stránky (restyling, logika beze změny)

### 4.1 Login `/login`
- [x] Vycentrovaná „glass“ karta na aurora pozadí, brand nahoře, prémiové inputy (`.input`),
      gradientní primární tlačítko, decentnější box s testovacími údaji (collapsible vzhled).

### 4.2 Kniha návštěv `/` (CEO)
- [x] Page header → titulní pruh s živými KPI (V budově / Dnes / Odešli) jako mini-stat chipy + hodiny + refresh.
- [x] Levý sloupec „Karta příchodu“ → prémiový dropzone (OCR), čistší formulář.
- [x] Pravý sloupec „Logbook“ → hledání, podtržené taby, řádky s avatarem iniciál + chipy (čas, doba, SPZ).

### 4.3 CEO Dashboard `/dashboard`
- [x] Header → název + evakuační tlačítko (decentnější, ale výrazné), výběr měsíce, refresh.
- [x] 4 KPI dlaždice → redesign `.stat-card` s ikonami a akcenty.
- [x] Taby (Přítomnost & Korekce / Mzdy / Směny / Zaměstnanci) → `.tab` styl.
- [x] Obsah tabů: karty `.surface` + `.card-accent`, tabulky/listy sladit, AI chat widget zůstává (jen vizuální doladění).

### 4.4 Portál zaměstnance `/portal`
- [x] Header → identita + (pro CEO) přepínač zaměstnance.
- [x] Karta plnění fondu (progress) + profilová karta → redesign.
- [x] Historie zápisů, formulář korekcí, stav žádostí, plán směn → sladit s designem.

### 4.5 Kiosk `/kiosk`
- [x] Fullscreen nástěnný vzhled: tmavší/„prémiový“ podklad, velké hodiny, velké dlaždice kroků, PIN pad, akční tlačítka – zvýraznit, zpřehlednit.

---

## 5. Závěr
- [x] Kontrola buildu (`next build`) / lintu – bez nových chyb (18/18 routes OK).
- [x] Stručné shrnutí změn uživateli.

> Poznámka: žádné API, schéma ani business logika se nemění. Pouze UI/UX vrstva.
