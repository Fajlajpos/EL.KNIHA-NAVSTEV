import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Chybí zprávy chatu." }, { status: 400 });
    }
    const session = await getSession(req);
    const today = new Date();
    const startOfToday = new Date(today);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const daysOfWeek = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
    const dayName = daysOfWeek[today.getDay()];

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowDayName = daysOfWeek[tomorrow.getDay()];

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayDayName = daysOfWeek[yesterday.getDay()];

    const startOfYesterday = new Date(yesterday);
    startOfYesterday.setHours(0, 0, 0, 0);

    const endOf7Days = new Date(today);
    endOf7Days.setDate(today.getDate() + 7);
    endOf7Days.setHours(23, 59, 59, 999);

    const formatShiftDate = (d: Date) => {
      const day = d.getUTCDate();
      const month = d.getUTCMonth() + 1;
      const year = d.getUTCFullYear();
      const dayOfWeekName = daysOfWeek[d.getUTCDay()];
      return `${day}. ${month}. ${year} (${dayOfWeekName})`;
    };

    let systemPrompt = "";

    // Dvojí režim: Zaměstnanec vs CEO/Manažer
    if (session && session.role === "EMPLOYEE") {
      // ZAMĚSTNANECKÝ REŽIM - Pouze jeho vlastní data (Rychlost & Soukromí)
      const user = await prisma.user.findUnique({
        where: { employeeNumber: session.employeeNumber },
      });

      if (!user) {
        return NextResponse.json({ error: "Uživatel nebyl nalezen v databázi." }, { status: 404 });
      }

      // Načtení směn v rozmezí Včera až +7 dní
      const userShifts = await prisma.shift.findMany({
        where: {
          userId: user.id,
          date: { gte: startOfYesterday, lte: endOf7Days },
        },
        orderBy: { date: "asc" },
      });

      const userLogs = await prisma.attendanceLog.findMany({
        where: {
          userId: user.id,
          checkIn: { gte: startOfToday, lte: endOfToday },
        },
        orderBy: { checkIn: "asc" },
      });

      // Výpočet přesčasů za aktuální měsíc
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthlyLogs = await prisma.attendanceLog.findMany({
        where: {
          userId: user.id,
          checkIn: { gte: startOfMonth, lte: endOfToday },
          status: { not: "ERROR" },
        },
      });

      let totalMs = 0;
      monthlyLogs.forEach((log) => {
        if (log.checkOut && log.logType === "WORK") {
          totalMs += new Date(log.checkOut).getTime() - new Date(log.checkIn).getTime();
        }
      });
      const hoursWorked = parseFloat((totalMs / (1000 * 60 * 60)).toFixed(2));
      const monthlyFundTarget = user.hourlyFund * 4;
      const balance = parseFloat((hoursWorked - monthlyFundTarget).toFixed(2));

      systemPrompt = `Jsi 'CHECKNI TO AI' - přátelský asistent docházky pro zaměstnance naší společnosti.
Mluvíš se zaměstnancem:
- Jméno: **${user.firstName} ${user.lastName}**
- Osobní číslo: **${user.employeeNumber}**
- Oddělení: **${user.department}**
- Pracovní úvazek: **${user.hourlyFund} hodin týdně**

Dnešní datum je ${today.toLocaleDateString("cs-CZ")} (${dayName}), aktuální čas je ${today.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}.
Zítra je ${tomorrow.toLocaleDateString("cs-CZ")} (${tomorrowDayName}).
Včera bylo ${yesterday.toLocaleDateString("cs-CZ")} (${yesterdayDayName}).

### PLÁN TVÝCH SMĚN (Včera až +7 dní):
${userShifts.length > 0 ? userShifts.map(s => `- Směna: **${formatShiftDate(s.date)}** od ${s.startTime} do ${s.endTime}${s.note ? ` (${s.note})` : ""}`).join("\n") : "Nemáš naplánované žádné změny pro toto období."}

### TVÉ DNEŠNÍ ZÁPISY DOCHÁZKY:
${userLogs.length > 0 ? userLogs.map(log => `- ${log.logType}: od ${log.checkIn.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })} ${log.checkOut ? `do ${log.checkOut.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}` : "(stále probíhá - jsi v práci)"}`).join("\n") : "Dnes nemáš žádný zápis v docházce. Nezapomeň se po příchodu pípnout na terminálu!"}

### TVÉ STATISTIKY ZA TENTO MĚSÍC (${today.toLocaleString("cs-CZ", { month: "long" })}):
- Odpracováno: **${hoursWorked} hod**
- Měsíční fond: **${monthlyFundTarget} hod**
- Saldo přesčasů: **${balance >= 0 ? `+${balance}` : balance} hod**

### POKYNY:
1. Oslovuj zaměstnance křestním jménem, tykej mu a buď přátelský (např. 'Ahoj ${user.firstName}...').
2. VŠEOBECNÝ ASISTENT (DŮLEŽITÉ): Jsi plnohodnotný a inteligentní AI asistent. Uživatel se tě může ptát na cokoliv (obecné znalosti, recepty, programování, matematika, překlady, kreativní psaní, rady, vysvětlení atd.). Pokud se dotaz netýká docházkového systému nebo naší společnosti, odpověz svobodně, kreativně a užitečně na základě svých vlastních všeobecných znalostí jako asistent.
3. DŮLEŽITÉ ČASOVÉ ÚDAJE: Slova jako "dnes" (dneska), "zítra" (zitra), "včera" (vcera), "víkend" (vikend) atd. jsou časové údaje.
   - Pokud se uživatel ptá, jaký/co je zítra za den (i bez diakritiky), odpovídáš přímo a přirozeně: "Zítra je ${tomorrowDayName} (${tomorrow.toLocaleDateString("cs-CZ")})."
   - Pokud se uživatel ptá, jaký/co je dnes za den, odpovídáš přímo a přirozeně: "Dnes je ${dayName} (${today.toLocaleDateString("cs-CZ")})."
   - Pokud se uživatel ptá, jaký/co bylo včera za den, odpovídáš přímo a přirozeně: "Včera bylo ${yesterdayDayName} (${yesterday.toLocaleDateString("cs-CZ")})."
   - Zákaz halucinací: Slovo "zítra/zitra" NIKDY neinterpretuj jako chemickou látku, sladidlo, kuchyňský přípravek nebo recept (jako Zincitrína apod.). Je to běžné české slovo pro následující den. Odpovídej přirozeně a přímo k věci.
4. KONTROLA A PLÁNOVÁNÍ SMĚN (DŮLEŽITÉ): Pokud se uživatel ptá, zda má směnu dnes, zítra, včera, nebo v konkrétní datum:
   - Zkontroluj seznam "PLÁN TVÝCH SMĚN" výše.
   - Porovnej požadovaný den/datum s daty naplánovaných směn. Například pro dotaz na zítřek porovnej s datem zítřka: ${tomorrow.toLocaleDateString("cs-CZ")} (${tomorrowDayName}).
   - Pokud v seznamu pro toto datum existuje směna, odpověz, že směnu má, a uveď její čas (od-do) a případnou poznámku.
   - Pokud v seznamu pro toto datum ŽÁDNÁ směna neexistuje, znamená to, že směnu NEMÁ (má volno / nepracuje). Odpověz přímo, že pro tento den nemá naplánovanou žádnou směnu.
   - Nikdy netvrď, že směnu má i nemá zároveň, a nevymýšlej si neexistující směny.
5. Pokud se ptá na svou docházku, přesčasy nebo provedené zápisy za dnes, odpověz přesně podle dat v tabulce "TVÉ DNEŠNÍ ZÁPISY DOCHÁZKY" výše.
6. Výpočet konce pracovní doby: pokud má dnes směnu a přišel (má zápis WORK), přičti k času příchodu (checkIn) 8.5 hodiny (8h práce + 30 min oběd) a řekni mu přibližný čas odchodu.
7. Bezpečnost: Pokud se ptá na docházku cizích zaměstnanců, zdvořile odpověz, že máš z důvodu ochrany dat přístup pouze k jeho docházce.
8. Odpovědi piš stručně, přehledně a formátuj je v Markdownu.
`;
    } else {
      // MANAŽERSKÝ/CEO REŽIM - Kompletní přehled (původní chování)
      // Optimalizace: Filtrujeme pouze aktivní uživatele (user: { isActive: true }) pro úsporu stovek řádků
      const activeVisitors = await prisma.visit.findMany({
        where: { cas_odchodu: null },
        orderBy: { cas_prichodu: "desc" },
      });

      const todayEmployeeLogs = await prisma.attendanceLog.findMany({
        where: {
          checkIn: { gte: startOfToday, lte: endOfToday },
          user: { isActive: true },
        },
        include: {
          user: true,
        },
        orderBy: { checkIn: "desc" },
      });

      const todayShifts = await prisma.shift.findMany({
        where: {
          date: { gte: startOfYesterday, lte: endOf7Days },
          user: { isActive: true },
        },
        include: {
          user: true,
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      });

      // Formátujeme seznamy na minimum znaků (úspora tokenů na CPU Ollama)
      const visitorsInside = activeVisitors
        .map((v) => `- Host: ${v.prijmeni} ${v.jmeno[0]}. (${v.organizace || "Návštěva"}, SPZ: ${v.spz || "-"}, Příchod: ${v.cas_prichodu.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })})`)
        .join("\n");

      const employeesInside = todayEmployeeLogs
        .filter((log) => !log.checkOut)
        .map((log) => `- ${log.user.lastName} ${log.user.firstName[0]}. (Odd.: ${log.user.department}, Stav: ${log.logType}, Příchod: ${log.checkIn.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })})`)
        .join("\n");

      const todayShiftsList = todayShifts
        .map((s) => `- ${s.user.lastName} ${s.user.firstName[0]}.: **${formatShiftDate(s.date)}** ${s.startTime}-${s.endTime}${s.note ? ` (${s.note})` : ""}`)
        .join("\n");

      const todayLogsList = todayEmployeeLogs
        .map((log) => `- ${log.user.lastName} ${log.user.firstName[0]}.: ${log.logType} (${log.checkIn.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}-${log.checkOut ? log.checkOut.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) : "nyní"})`)
        .join("\n");

      systemPrompt = `Jsi 'CHECKNI TO AI' - inteligentní asistent a analytik docházkového a návštěvního systému pro naši výrobní společnost (závody Habartov a Svatava).
Odpovídáš mistrům, manažerům a CEO ohledně docházky a přítomných lidí.

Dnešní datum je ${today.toLocaleDateString("cs-CZ")} (${dayName}), aktuální čas je ${today.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}.
Zítra je ${tomorrow.toLocaleDateString("cs-CZ")} (${tomorrowDayName}).
Včera bylo ${yesterday.toLocaleDateString("cs-CZ")} (${yesterdayDayName}).

### LIDÉ AKTUÁLNĚ V BUDOVĚ:
**Zaměstnanci:**
${employeesInside || "Žádný zaměstnanec není momentálně přihlášen."}

**Návštěvy:**
${visitorsInside || "Žádný host není v budově."}

### SMĚNY V OBDOBÍ (Včera až +7 dní):
${todayShiftsList || "Žádné směny."}

### DNEŠNÍ LOGY (PRŮCHODY):
${todayLogsList || "Žádné průchody."}

### POKYNY:
1. Odpovídej česky, stručně, věcně a profesionálně.
2. VŠEOBECNÝ ASISTENT (DŮLEŽITÉ): Jsi plnohodnotný a inteligentní AI asistent. Uživatel se tě může ptát na cokoliv (obecné znalosti, recepty, programování, matematika, překlady, kreativní psaní, rady, vysvětlení atd.). Pokud se dotaz netýká docházkového systému, návštěv nebo naší společnosti, odpověz svobodně, kreativně a užitečně na základě svých vlastních všeobecných znalostí jako asistent.
3. DŮLEŽITÉ ČASOVÉ ÚDAJE: Slova jako "dnes" (dneska), "zítra" (zitra), "včera" (vcera), "víkend" (vikend) atd. jsou časové údaje.
   - Pokud se uživatel ptá, jaký/co je zítra za den (i bez diakritiky), odpovídáš přímo a přirozeně: "Zítra je ${tomorrowDayName} (${tomorrow.toLocaleDateString("cs-CZ")})."
   - Pokud se uživatel ptá, jaký/co je dnes za den, odpovídáš přímo a přirozeně: "Dnes je ${dayName} (${today.toLocaleDateString("cs-CZ")})."
   - Pokud se uživatel ptá, jaký/co bylo včera za den, odpovídáš přímo a přirozeně: "Včera bylo ${yesterdayDayName} (${yesterday.toLocaleDateString("cs-CZ")})."
   - Zákaz halucinací: Slovo "zítra/zitra" NIKDY neinterpretuj jako chemickou látku, sladidlo, kuchyňský přípravek nebo recept (jako Zincitrína apod.). Je to běžné české slovo pro následující den. Odpovídej přirozeně a přímo k věci.
4. KONTROLA A PLÁNOVÁNÍ SMĚN: Pokud se dotaz týká směn konkrétního zaměstnance nebo všech na určitý den (např. dnes, zítra, včera, nebo konkrétní datum):
   - Zkontroluj seznam "SMĚNY V OBDOBÍ" výše.
   - Porovnej požadovaný den/datum s daty naplánovaných směn.
   - Pokud pro daného zaměstnance a datum existuje v seznamu směna, uveď její detaily.
   - Pokud pro daného zaměstnance a datum v seznamu ŽÁDNÁ směna není, znamená to, že směnu nemá (má volno / nepracuje). Sděl to jasně a nevymýšlej si směny.
   - Nikdy netvrď, že směnu má i nemá zároveň.
5. Pokud se dotaz týká přítomnosti lidí nebo dnešních průchodů (logů) ve firmě, čerpej z příslušných dnešních tabulek výše. Pravidlo "čerpej z tabulek a nevymýšlej si" se vztahuje VÝHRADNĚ na tato interní firemní data (docházka, logy, návštěvy). Obecné dotazy mimo firmu zodpovídej volně ze svých vlastních znalostí.
6. Používej formátování Markdown (tabulky, seznamy).
`;
    }

    // 4. Send request to selected provider (Ollama or OpenAI)
    const provider = process.env.AI_PROVIDER || "ollama";

    if (provider === "ollama") {
      const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      const ollamaModel = process.env.OLLAMA_MODEL || "gemma2:2b";

      try {
        const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [
              { role: "system", content: systemPrompt },
              ...messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
            ],
            stream: true,
            options: {
              temperature: 0.5,
              num_ctx: 2048,
              num_predict: 350,
            }
          }),
        });

        if (!ollamaRes.ok) {
          const errText = await ollamaRes.text();
          throw new Error(`Ollama API error: ${ollamaRes.status} ${errText}`);
        }

        const stream = new ReadableStream({
          async start(controller) {
            const reader = ollamaRes.body?.getReader();
            if (!reader) {
              controller.close();
              return;
            }
            const decoder = new TextDecoder();
            let buffer = "";

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.trim() === "") continue;
                  try {
                    const parsed = JSON.parse(line);
                    const token = parsed.message?.content || "";
                    if (token) {
                      controller.enqueue(new TextEncoder().encode(token));
                    }
                  } catch (e) {
                    console.error("Failed to parse Ollama stream line:", line, e);
                  }
                }
              }
              if (buffer.trim() !== "") {
                try {
                  const parsed = JSON.parse(buffer);
                  const token = parsed.message?.content || "";
                  if (token) {
                    controller.enqueue(new TextEncoder().encode(token));
                  }
                } catch {
                  /* ignore */
                }
              }
            } catch (err) {
              controller.error(err);
            } finally {
              controller.close();
            }
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      } catch (err) {
        console.error("Failed to connect to local Ollama server:", err);
        return NextResponse.json(
          {
            error: "Lokální Ollama server neodpovídá. Ujistěte se, že je spuštěn na portu 11434 a model '" + ollamaModel + "' je stažen (příkaz: ollama run " + ollamaModel + "). Pokud chcete běžet přes cloud, přepněte AI_PROVIDER=openai v .env.",
          },
          { status: 502 }
        );
      }
    } else {
      // OpenAI Fallback
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey || apiKey === "sk-proj-placeholder-replace-me") {
        return NextResponse.json(
          { error: "Není nakonfigurován OPENAI_API_KEY v souboru .env a AI_PROVIDER je nastaven na openai." },
          { status: 400 }
        );
      }

      try {
        const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              ...messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
            ],
            temperature: 0.7,
            stream: true,
          }),
        });

        if (!openaiRes.ok) {
          const errText = await openaiRes.text();
          throw new Error(`OpenAI API error: ${openaiRes.status} ${errText}`);
        }

        const stream = new ReadableStream({
          async start(controller) {
            const reader = openaiRes.body?.getReader();
            if (!reader) {
              controller.close();
              return;
            }
            const decoder = new TextDecoder();
            let buffer = "";

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  const cleanedLine = line.trim();
                  if (cleanedLine === "" || cleanedLine === "data: [DONE]") continue;
                  if (cleanedLine.startsWith("data: ")) {
                    try {
                      const jsonStr = cleanedLine.slice(6);
                      const parsed = JSON.parse(jsonStr);
                      const token = parsed.choices?.[0]?.delta?.content || "";
                      if (token) {
                        controller.enqueue(new TextEncoder().encode(token));
                      }
                    } catch (e) {
                      console.error("Failed to parse OpenAI stream line:", line, e);
                    }
                  }
                }
              }
            } catch (err) {
              controller.error(err);
            } finally {
              controller.close();
            }
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error("OpenAI request failed:", err);
        return NextResponse.json({ error: "Dotaz na OpenAI selhal: " + errorMsg }, { status: 500 });
      }
    }
  } catch (error) {
    console.error("Error in AI chat route:", error);
    return NextResponse.json({ error: "Došlo k vnitřní chybě při zpracování dotazu." }, { status: 500 });
  }
}
