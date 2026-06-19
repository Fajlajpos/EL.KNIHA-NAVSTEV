import fs from "fs";
import path from "path";

// Jeden zaznam prihlasovacich udaju zamestnance.
export interface UserCredential {
  username: string;
  password: string;
  displayName: string;
  role: string;
  employeeNumber: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  email?: string;
  pin?: string;
  hourlyFund?: number;
}

// Mapovani pripony klice v .env (USER_1_<FIELD>) na pole objektu.
const FIELD_MAP: Record<string, keyof UserCredential> = {
  USERNAME: "username",
  PASSWORD: "password",
  PIN: "pin",
  ROLE: "role",
  DISPLAYNAME: "displayName",
  FIRSTNAME: "firstName",
  LASTNAME: "lastName",
  EMPLOYEENUMBER: "employeeNumber",
  DEPARTMENT: "department",
  EMAIL: "email",
  HOURLYFUND: "hourlyFund",
};

const ROLE_LABELS: Record<string, string> = {
  CEO: "Reditel / CEO",
  MANAGER: "Manazer",
  ADMIN: "Administrator",
  EMPLOYEE: "Zamestnanec",
};

function getEnvPath(): string {
  return path.resolve(process.cwd(), ".env");
}

// Odstrani volitelne uvozovky kolem hodnoty.
function unquote(value: string): string {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

// Diakritiku v komentari zahlavi odstranujeme, aby sekce vypadala jednotne.
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Nacte zamestnance z .env. Cte primo soubor (ne process.env), takze rucni
// uprava hesla v .env se projevi pri dalsim pozadavku bez restartu serveru.
export function readUsers(): UserCredential[] {
  let content: string;
  try {
    content = fs.readFileSync(getEnvPath(), "utf-8");
  } catch {
    return [];
  }

  const byIndex = new Map<number, Partial<UserCredential>>();
  const lineRe = /^USER_(\d+)_([A-Z]+)\s*=\s*(.*)$/;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const m = line.match(lineRe);
    if (!m) continue;

    const idx = parseInt(m[1], 10);
    const field = FIELD_MAP[m[2]];
    if (!field) continue;

    const value = unquote(m[3]);
    if (!byIndex.has(idx)) byIndex.set(idx, {});
    const obj = byIndex.get(idx)!;

    if (field === "hourlyFund") {
      const n = parseFloat(value);
      obj.hourlyFund = Number.isNaN(n) ? 40 : n;
    } else if (value !== "") {
      (obj as Record<string, unknown>)[field] = value;
    }
  }

  const users: UserCredential[] = [];
  for (const idx of Array.from(byIndex.keys()).sort((a, b) => a - b)) {
    const o = byIndex.get(idx)!;
    if (!o.username || !o.password) continue;
    users.push({
      username: o.username,
      password: o.password,
      displayName: o.displayName || o.username,
      role: o.role || "EMPLOYEE",
      employeeNumber: o.employeeNumber || "",
      firstName: o.firstName,
      lastName: o.lastName,
      department: o.department,
      email: o.email,
      pin: o.pin,
      hourlyFund: o.hourlyFund,
    });
  }

  // Zpetna kompatibilita: stary jednoradkovy format USERS_CREDENTIALS='[...]'.
  if (users.length === 0) {
    const legacy = content.match(/^USERS_CREDENTIALS=(.*)$/m);
    if (legacy) {
      try {
        return JSON.parse(unquote(legacy[1]));
      } catch {
        /* ignore */
      }
    }
  }

  return users;
}

// Sestavi prehlednou sekci: zahlavi + blok poli pro kazdeho zamestnance.
function buildBlock(users: UserCredential[]): string {
  const lines: string[] = [];
  lines.push("# ============================================");
  lines.push("# PRIHLASOVACI UDAJE ZAMESTNANCU");
  lines.push("# ============================================");
  lines.push("# Heslo nebo PIN zmenis primo zde: uprav prislusny radek a uloz soubor.");
  lines.push("# Pole jednoho zamestnance jsou pohromade pod sebou.");
  lines.push("# Cislo (USER_1, USER_2, ...) jen oddeluje zamestnance, na poradi nezalezi.");
  lines.push("# Tato sekce se aktualizuje i pri pridani/odebrani zamestnance v dashboardu.");
  lines.push("");

  users.forEach((u, i) => {
    const n = i + 1;
    const label = ROLE_LABELS[u.role] || "Zamestnanec";
    lines.push(`# --- ${n}. ${stripDiacritics(u.displayName)} (${label}) ---`);
    lines.push(`USER_${n}_USERNAME=${u.username}`);
    lines.push(`USER_${n}_PASSWORD=${u.password}`);
    lines.push(`USER_${n}_PIN=${u.pin ?? ""}`);
    lines.push(`USER_${n}_ROLE=${u.role}`);
    lines.push(`USER_${n}_DISPLAYNAME=${u.displayName}`);
    lines.push(`USER_${n}_FIRSTNAME=${u.firstName ?? ""}`);
    lines.push(`USER_${n}_LASTNAME=${u.lastName ?? ""}`);
    lines.push(`USER_${n}_EMPLOYEENUMBER=${u.employeeNumber}`);
    lines.push(`USER_${n}_DEPARTMENT=${u.department ?? ""}`);
    lines.push(`USER_${n}_EMAIL=${u.email ?? ""}`);
    lines.push(`USER_${n}_HOURLYFUND=${u.hourlyFund ?? 40}`);
    lines.push("");
  });

  return lines.join("\n").replace(/\s+$/, "");
}

// Zapise zamestnance zpet do .env. Zachova vse nad sekci udaju (DATABASE_URL,
// OPENAI_API_KEY, ...) a celou sekci udaju prepise novym blokem.
export function writeUsers(users: UserCredential[]): void {
  const envPath = getEnvPath();
  let content = "";
  try {
    content = fs.readFileSync(envPath, "utf-8");
  } catch {
    /* soubor jeste neexistuje */
  }

  // Sekce udaju je vzdy na konci souboru (od zahlavi nize).
  const sectionRe =
    /\r?\n*# ={5,}\r?\n# PRIHLASOVACI UDAJE ZAMESTNANCU[\s\S]*$/;

  let head: string;
  if (sectionRe.test(content)) {
    head = content.replace(sectionRe, "");
  } else {
    // Zadne zahlavi: odstran pripadne osamocene radky s udaji (vc. legacy).
    head = content
      .split(/\r?\n/)
      .filter(
        (l) =>
          !/^USER_\d+_/.test(l.trim()) && !/^USERS_CREDENTIALS=/.test(l.trim())
      )
      .join("\n");
  }

  head = head.replace(/\s+$/, "");
  const block = buildBlock(users);
  const output = head ? `${head}\n\n${block}\n` : `${block}\n`;

  fs.writeFileSync(envPath, output, "utf-8");
}
