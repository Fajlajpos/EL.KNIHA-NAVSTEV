 Kompletní Prompt pro transformaci Elektronické knihy návštěv na Docházkový systém

---

## Kontext projektu a analýza společnosti
Tento prompt slouží jako zadání pro refaktorizaci a rozšíření stávající aplikace „Elektronická kniha návštěv“. Cílem je vytvořit **robustní a automatizovaný docházkový systém (Attendance & Time Tracking System)**.

Aplikace bude nasazena ve společnosti **ept connector s.r.o.** (výrobní hi-tech závody Habartov a Svatava). To s sebou nese specifické byznys požadavky:
* **Směnný provoz:** Výroba běží v režimu ranních, odpoledních a nočních směn, včetně víkendů. Systém musí umět kalkulovat příplatky podle zákoníku práce (odpolední 5 %, noční 15 %, víkend 15 %).
* **Vysoká propustnost (Rychlost):** Při střídání směn nesmí docházet k frontám u terminálu. Pípnutí příchodu/odchodu musí zabrat méně než 2 sekundy na pracovníka.
* **Rozdílné typy zaměstnanců:** THP pracovníci (kanceláře - flexibilní doba) vs. Výrobní dělníci (fixní směny, práce u strojů).

---

## 🤖 ZADÁNÍ PRO AI / DEVELOPERA (PROMPT)

**Tvá role:** Jsi Senior Full-Stack Developer, Databázový Inženýr a Softwarový Architekt. Tvým úkolem je vzít stávající logiku knihy návštěv (zápis ID, příchodu a odchodu) a transformovat ji na podnikový docházkový systém splňující níže uvedené specifikace.

### 1. Architektura a Databázový model (SQL / NoSQL)
Navrhni a implementuj rozšíření databázové struktury. Původní tabulka pro návštěvy zůstane zachována (nebo oddělena), pro zaměstnance vytvoř tyto entity s vazbami (1:N):

* **`Users` (Zaměstnanci):**
    * `id` (Primary Key)
    * `employee_number` (Osobní číslo zaměstnance, unikátní)
    * `first_name`, `last_name`, `email`, `department` (Výroba, Sklad, THP, Management...)
    * `role` (Employee / Manager / CEO / Admin)
    * `pin_hash` (4místný PIN pro manuální přihlášení)
    * `rfid_card_uid` (UID kód RFID čipu/karty pro rychlé pípnutí)
    * `hourly_fund` (Pracovní úvazek např. 37.5 nebo 40 hodin týdně)
    * `created_at`, `is_active`
* **`AttendanceLogs` (Záznamy docházky):**
    * `id` (Primary Key)
    * `user_id` (Foreign Key -> Users)
    * `check_in` (DateTime - čas příchodu)
    * `check_out` (DateTime - čas odchodu, nullable)
    * `log_type` (Enum: 'WORK', 'LUNCH', 'DOCTOR', 'BUSINESS_TRIP', 'BREAK')
    * `status` (Enum: 'OK', 'OPEN' (neuzavřený den), 'ERROR' (anomálie), 'MANUALLY_EDITED')
    * `edited_by` (Foreign Key -> Users, nullable - kdo provedl ruční opravu)
    * `note` (Text - důvod opravy nebo poznámka)
* **`Absences` (Plánované absence):**
    * `id`, `user_id`, `start_date`, `end_date`, `absence_type` ('VACATION', 'SICK_LEAVE', 'COMPENSATORY_LEAVE'), `approved_by`, `status`

---

### 2. Frontend & Uživatelské rozhraní (UI/UX)

#### A. Kioskový terminál (U vchodu do budovy / dílny)
* **Rozhraní:** Optimalizované pro dotykový tablet (např. 10" s přední kamerou) upevněný na zdi. Velké, kontrastní prvky.
* **Metoda ověření:**
    1.  *Primární:* Přiložení RFID karty/čipu k USB čtečce připojené k tabletu (systém okamžitě identifikuje uživatele).
    2.  *Sekundární:* Výběr oddělení -> Jména ze seznamu + zadání 4místného PINu (pro případ, že zaměstnanec zapomene kartu).
* **Průběh akce:** Po identifikaci systém okamžitě zobrazí aktuální stav zaměstnance (např. *„Jste přítomen od 06:01“*) a nabídne 2-4 velká barevná tlačítka (min. 100x100px):
    * `ODCHOD Z PRÁCE` (Červené)
    * `PAUZA / OBĚD` (Žluté)
    * `ODCHOD K LÉKAŘI` (Modré)
* **Automatické dokončení:** Pokud zaměstnanec do 3 sekund nic nezvolí, systém na základě jeho aktuálního stavu provede logickou akci (pokud byl venku, zapíše `PŘÍCHOD`, pokud byl uvnitř, zapíše `ODCHOD`) a obrazovka se vyčistí pro dalšího člověka.

#### B. Zaměstnanecký portál (Přístup z PC)
* Jednoduché zobrazení osobního kalendáře docházky pro aktuální měsíc.
* Přehled odpracovaných hodin vs. měsíční fond (zelený/červený progress bar).
* Formulář: „Žádost o opravu docházky“ (pokud zapomněl pípnout, zadá čas a důvod, který se odešle nadřízenému ke schválení).

---

### 3. Backend, Business Logika a CEO Dashboard

#### A. Výpočetní logika a Směny (Klíčová vlastnost pro ept connector s.r.o.)
Napiš algoritmus, který na konci každého dne (nebo při uzavření docházky) zanalizuje `AttendanceLogs` a vypočítá:
1.  **Celkovou odpracovanou dobu** (po odečtení přestávek).
2.  **Automatické odečítání přestávek:** Pokud zaměstnanec zapomene pípnout pauzu na oběd a pracuje v kuse déle než 6 hodin, systém mu ze zákona automaticky odečte 30 minut (konfigurovatelné).
3.  **Noční směna (Příplatek 15 %):** Spočítej hodiny odpracované v čase mezi 22:00 a 06:00.
4.  **Odpolední směna (Příplatek 5 %):** Spočítej hodiny odpracované v čase mezi 14:00 a 22:00.
5.  **Víkendový příplatek (15 %):** Detekuj, zda hodiny spadají do soboty či neděle.

#### B. CEO & Management Dashboard (Přehled pro ředitele a mistry)
Vytvoř manažerské rozhraní s těmito funkcemi:
1.  **Live Monitor (Evakuační plán):** Seznam všech zaměstnanců, kteří jsou *aktuálně* v budově, rozdělený podle oddělení (Habartov vs. Svatava, Výroba vs. Kanceláře). Obsahuje tlačítko „Export pro evakuaci“ (čistý text/PDF pro případ požáru).
2.  **Přehled plnění fondu:** Tabulka zaměstnanců zobrazující: Jméno | Dnes odpracováno | Tento měsíc celkem | Saldo (v plusu/mínusu oproti fondu).
3.  **Detekce anomálií a chyb:** Systém musí červeně vlajkovat (Flag) tyto stavy:
    * *„Zapomenutý odchod“:* `check_in` proběhl, ale systém zaznamenal nepřerušenou aktivitu delší než 14 hodin. Automaticky status přepne na `ERROR` a neuzavře den.
    * *„Nedodržení fondu“:* Zaměstnanec systematicky odchází o X minut dříve.
    * *„Překryvy časů“:* Ručně zadané časy kolidují s reálnými logy.
4.  **Schvalovací centrum (Approve workflow):** Mistr/CEO vidí seznam žádostí o opravu časů od zaměstnanců. Jedním klikem schválí/zamítne.
5.  **Export podkladů pro mzdy:** Generátor reportu za zvolené období (měsíc) ve formátu **Excel (.xlsx) / CSV** strukturovaný přesně pro mzdovou účtárnu (Osobní číslo, Jméno, Celkem hodin, Noční hodiny, Víkendové hodiny, Přesčasy, Čerpaná dovolená).

---

### 4. Bezpečnost a Integrita dat (Anti-Cheat mechanismy)
* **IP / Network Lock:** Kioskový režim terminálu smí přijímat požadavky pouze z definovaných interních IP adres firmy (firemní Wi-Fi/LAN), aby nebylo možné pípat docházku z domova.
* **Audit Log:** Jakákoliv ruční změna času provedená manažerem nebo schválená žádost musí ukládat informaci o tom, *kdo* změnu provedl, *kdy* ji provedl a *původní hodnotu* před změnou.

---

### 5. Technické instrukce pro implementaci
* Zachovej styl kódování, framework a jazyk z mého původního repozitáře (např. PHP/Laravel, Node.js, Python/Flask...).
* Navrhni čisté REST API endpointy: `POST /api/v1/attendance/punch`, `GET /api/v1/attendance/live`, `PUT /api/v1/attendance/logs/{id}/migrate`.
* Napiš nejdříve strukturu DB migrací, následně backendovou logiku výpočtu směn a nakonec frontend komponentu pro Kioskový terminál.