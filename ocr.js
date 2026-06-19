/**
 * CHECKNI TO - Offline OCR modul pro vytěžování dokladů v prohlížeči.
 * Používá Tesseract.js načtený přes CDN a Canvas API pro předzpracování.
 * 
 * Vše běží 100% na zařízení uživatele v prohlížeči (on-device).
 * Fotografie dokladů se neukládají ani neposílají na server (GDPR).
 */

// Konfigurace REST API endpointu pro zápis návštěvy
export const API_URL = '/api/visits';

/**
 * Převede text do formátu Title Case (např. JAN PETR -> Jan Petr, NOVÁK -> Novák)
 * @param {string} str - Vstupní řetězec
 * @returns {string} Zformátovaný řetězec
 */
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Vyčistí jméno/příjmení od nežádoucích OCR znaků (tečky, lomítka, závorky atd.)
 * @param {string} str - Extrahované jméno
 * @returns {string} Vyčištěné jméno
 */
function sanitizeName(str) {
  // Ponecháme pouze písmena (včetně české diakritiky), mezery a pomlčky
  return str
    .replace(/[^A-Za-zÁ-Žá-ž\s\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Předzpracuje obrázek na Canvasu před předáním do OCR.
 * Provádí převod na stupně šedi a výrazně zvyšuje kontrast (thresholding),
 * čímž napomáhá Tesseractu lépe rozpoznat text a eliminovat šum na pozadí dokladu.
 * 
 * @param {HTMLImageElement} img - Původní načtený obrázek
 * @returns {HTMLCanvasElement} Předzpracovaný canvas
 */
export function preprocessImage(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  
  // Vykreslíme původní obrázek na canvas
  ctx.drawImage(img, 0, 0);
  
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  
  // Algoritmus pro převod na stupně šedi a zvýšení kontrastu
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Grayscale převod (standardní jasová složka Y = 0.299R + 0.587G + 0.114B)
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Zvýšení kontrastu (faktor 2.5 vytlačí tmavé tóny do černé a světlé do bílé)
    let contrast = (gray - 128) * 2.5 + 128;
    
    // Oříznutí hodnot do rozsahu 0-255
    if (contrast > 255) contrast = 255;
    if (contrast < 0) contrast = 0;
    
    data[i] = contrast;     // R
    data[i + 1] = contrast; // G
    data[i + 2] = contrast; // B
  }
  
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Načte soubor typu File do HTMLImageElementu v paměti.
 * @param {File} file - Nahraný soubor
 * @returns {Promise<HTMLImageElement>} Slib vracející načtený obrázek
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error("Nepodařilo se načíst data obrázku: " + err));
      img.src = event.target.result;
    };
    reader.onerror = (err) => reject(new Error("Nepodařilo se přečíst soubor: " + err));
    reader.readAsDataURL(file);
  });
}

/**
 * Pokusí se najít a parsovat MRZ (Machine Readable Zone) řádek se jménem na zadní straně OP (formát TD1).
 * Hledá řádek o cca 30 znacích, obsahující "<<" a složený pouze z A-Z, 0-9 a znaků '<'.
 * 
 * @param {string} rawText - Celý OCR text z Tesseractu
 * @returns {{jmeno: string, prijmeni: string} | null} Vytěžená data nebo null
 */
function parseMRZ(rawText) {
  const lines = rawText.split('\n');
  
  for (let line of lines) {
    // Odstraníme mezery (v MRZ nejsou mezery, pouze znaky '<')
    const cleaned = line.replace(/\s+/g, "").toUpperCase();
    
    // Hledáme řádek obsahující jména (obvykle 3. řádek na zadní straně OP, délka cca 30 znaků)
    if (cleaned.includes("<<") && /^[A-Z0-9<]{28,32}$/.test(cleaned)) {
      const parts = cleaned.split("<<");
      
      if (parts.length >= 2) {
        const rawPrijmeni = parts[0];
        // Jméno je za '<<' a může obsahovat více křestních jmen oddělených jedním '<'
        const rawJmeno = parts[1];
        
        const cleanPrijmeni = rawPrijmeni.replace(/</g, " ").trim();
        const cleanJmeno = rawJmeno.replace(/</g, " ").trim();
        
        return {
          prijmeni: sanitizeName(toTitleCase(cleanPrijmeni)),
          jmeno: sanitizeName(toTitleCase(cleanJmeno))
        };
      }
    }
  }
  return null;
}

/**
 * Fallback parsování pro přední stranu dokladu.
 * Hledá klíčová slova jako Příjmení / Surname a Jméno / Given Names
 * a čte hodnoty z příslušného řádku.
 * 
 * @param {string} rawText - Celý OCR text z Tesseractu
 * @returns {{jmeno: string, prijmeni: string}} Vytěžená data (mohou být prázdná)
 */
function parseFallback(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let jmeno = "";
  let prijmeni = "";

  const surnameKeywords = ["příjmení", "surname", "prijmeni"];
  const givenNameKeywords = ["jméno", "given name", "jmeno", "given names"];

  const surnameLabelRegex = /(?:příjmení\s*[\/\-]?\s*surname|surname\s*[\/\-]?\s*příjmení|prijmeni\s*[\/\-]?\s*surname|surname\s*[\/\-]?\s*prijmeni|příjmení|surname|prijmeni)\s*[:\/\-]?\s*/i;
  const givenNameLabelRegex = /(?:jméno\s*[\/\-]?\s*given\s+names?|given\s+names?\s*[\/\-]?\s*jméno|jmeno\s*[\/\-]?\s*given\s+names?|given\s+names?\s*[\/\-]?\s*jmeno|jméno|given\s+names?|jmeno)\s*[:\/\-]?\s*/i;

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    
    // 1. Vyhledání příjmení
    if (!prijmeni && surnameKeywords.some(kw => lineLower.includes(kw))) {
      const match = lines[i].match(surnameLabelRegex);
      if (match) {
        const matched = match[0];
        const index = lines[i].indexOf(matched);
        const value = lines[i].slice(index + matched.length).trim();
        if (value.length > 1) {
          prijmeni = sanitizeName(toTitleCase(value));
        } else if (i + 1 < lines.length) {
          const nextLineLower = lines[i + 1].toLowerCase();
          if (!givenNameKeywords.some(kw => nextLineLower.includes(kw))) {
            prijmeni = sanitizeName(toTitleCase(lines[i + 1].trim()));
          }
        }
      }
    }

    // 2. Vyhledání křestního jména
    if (!jmeno && givenNameKeywords.some(kw => lineLower.includes(kw))) {
      const match = lines[i].match(givenNameLabelRegex);
      if (match) {
        const matched = match[0];
        const index = lines[i].indexOf(matched);
        const value = lines[i].slice(index + matched.length).trim();
        if (value.length > 1) {
          jmeno = sanitizeName(toTitleCase(value));
        } else if (i + 1 < lines.length) {
          const nextLineLower = lines[i + 1].toLowerCase();
          if (!surnameKeywords.some(kw => nextLineLower.includes(kw))) {
            jmeno = sanitizeName(toTitleCase(lines[i + 1].trim()));
          }
        }
      }
    }
  }

  return { jmeno, prijmeni };
}

/**
 * Hlavní exportovaná funkce pro rozpoznání dokladu.
 * 
 * Strategie:
 * 1. Předzpracuje obrázek na canvasu (odstraní šum, zvýší kontrast).
 * 2. Spustí Tesseract.js v rychlém režimu ('eng' + whitelist znaků) pro vyhledání MRZ.
 * 3. Pokud nalezne MRZ řádek, rozparsuje ho a vrátí jméno a příjmení.
 * 4. Pokud MRZ nenalezne (např. přední strana OP), provede fallback čtení s jazykem 'ces+eng'
 *    bez whitelistu a vyhledá jména podle českých a anglických popisků.
 * 
 * @param {File} file - Soubor obrázku z inputu
 * @param {Function} onProgress - Callback pro zobrazení postupu (přijímá procenta 0-100)
 * @returns {Promise<{jmeno: string, prijmeni: string, raw: string}>} Vytěžená data a surový text
 */
export async function recognizeDocument(file, onProgress) {
  // Ověření, zda je Tesseract dostupný v globálním window
  if (!window.Tesseract) {
    throw new Error("Knihovna Tesseract.js nebyla nalezena. Ujistěte se, že je načtena v HTML.");
  }

  // 1. Načtení a předzpracování obrázku na canvas
  const img = await loadImage(file);
  const canvas = preprocessImage(img);
  
  let worker = null;
  let ocrResult = null;

  try {
    // KROK 1: Pokus o načtení MRZ (Strojový kód na zadní straně)
    // MRZ písmo (OCR-B) nepoužívá českou diakritiku, proto čteme v anglickém režimu 'eng' s whitelistem,
    // což dramaticky zvyšuje přesnost a eliminuje falešné detekce.
    worker = await window.Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing' && onProgress) {
          // Namapujeme průběh na 0-50%
          onProgress(Math.round(m.progress * 50));
        }
      }
    });

    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
    });

    const { data: { text: mrzText } } = await worker.recognize(canvas);
    await worker.terminate();
    worker = null; // uvolníme worker

    // Zkusíme parsovat jako MRZ
    const mrzData = parseMRZ(mrzText);
    if (mrzData && (mrzData.jmeno || mrzData.prijmeni)) {
      if (onProgress) onProgress(100);
      return {
        jmeno: mrzData.jmeno,
        prijmeni: mrzData.prijmeni,
        raw: mrzText
      };
    }

    // KROK 2: Pokud MRZ selhala (přední strana OP), spustíme fallback v plném češtino-anglickém režimu.
    // Nepoužíváme whitelist, protože potřebujeme diakritiku (Á-Ž).
    worker = await window.Tesseract.createWorker('ces+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing' && onProgress) {
          // Druhý průchod mapujeme na 50-100%
          onProgress(50 + Math.round(m.progress * 50));
        }
      }
    });

    const { data: { text: fallbackText } } = await worker.recognize(canvas);
    const fallbackData = parseFallback(fallbackText);
    
    if (onProgress) onProgress(100);
    return {
      jmeno: fallbackData.jmeno,
      prijmeni: fallbackData.prijmeni,
      raw: fallbackText
    };

  } catch (error) {
    console.error("Chyba při OCR zpracování:", error);
    throw new Error("OCR zpracování selhalo: " + error.message);
  } finally {
    // Ukončení a vyčištění workeru za všech okolností
    if (worker) {
      await worker.terminate();
    }
    
    // GDPR Bezpečnost: Vynutíme uvolnění zdrojů canvasu a obrázku z paměti
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Volá se při potvrzení vytěžených dat recepční.
 * Odešle jméno a příjmení na backend, který data uloží do PostgreSQL.
 * Čas příchodu vygeneruje databáze/backend automaticky.
 * 
 * @param {{jmeno: string, prijmeni: string}} data - Schválené údaje
 * @returns {Promise<Response>} HTTP odpověď ze serveru
 */
export async function onConfirm({ jmeno, prijmeni }) {
  if (!jmeno.trim() || !prijmeni.trim()) {
    throw new Error("Jméno a příjmení jsou povinná pro uložení.");
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jmeno: jmeno.trim(),
      prijmeni: prijmeni.trim()
    })
  });

  if (!response.ok) {
    throw new Error("Nepodařilo se uložit data na backend server.");
  }

  return response;
}
