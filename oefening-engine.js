// Oefenmotor: toont de vragen van één reeks, kijkt ze na en geeft feedback.
// Ondersteunde vraagtypes: mc (één juist antwoord), multi (meerdere juiste antwoorden),
// wn (waar/niet waar) en invul (zelf antwoord typen).

export function esc(tekst) {
  return String(tekst)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tekst opmaken: HTML ontsmetten, {3/4} tonen als een echte breuk, \n als nieuwe regel.
export function fmt(tekst) {
  return esc(tekst)
    .replace(
      /\{([\w,.\u2212-]+)\/([\w,.\u2212-]+)\}/g,
      '<span class="breuk" role="math" aria-label="$1 gedeeld door $2">' +
        '<span class="teller">$1</span><span class="noemer">$2</span></span>'
    )
    .replace(/\n/g, "<br>");
}

// Antwoorden vergelijken zonder gezeur over spaties, komma of punt, of maalteken.
export function normaliseer(tekst) {
  return String(tekst)
    .toLowerCase()
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[\u00b7\u22c5\u00d7x]/g, "*")
    .replace(/\s+/g, "")
    .replace(/[{}]/g, "")
    .replace(/,/g, ".")
    .replace(/\.$/, "");
}

export function gelijk(antwoord, verwacht) {
  const a = normaliseer(antwoord);
  const b = normaliseer(verwacht);
  if (a === "" || b === "") return false;
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

function schud(lijst) {
  const kopie = [...lijst];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

function vraagHtml(v) {
  const naam = "q" + v.nr;
  let hint = "";
  let invoer = "";

  if (v.type === "mc") {
    invoer = '<div class="opties">' + v.volgorde.map((k) =>
      `<label class="optie"><input type="radio" name="${naam}" value="${k}"><span class="optietekst">${fmt(v.opties[k])}</span></label>`
    ).join("") + "</div>";
  } else if (v.type === "multi") {
    hint = '<p class="hint">Meerdere antwoorden zijn mogelijk.</p>';
    invoer = '<div class="opties">' + v.volgorde.map((k) =>
      `<label class="optie"><input type="checkbox" name="${naam}" value="${k}"><span class="optietekst">${fmt(v.opties[k])}</span></label>`
    ).join("") + "</div>";
  } else if (v.type === "wn") {
    invoer = '<div class="opties opties-kort">' +
      `<label class="optie"><input type="radio" name="${naam}" value="true"><span class="optietekst">Waar</span></label>` +
      `<label class="optie"><input type="radio" name="${naam}" value="false"><span class="optietekst">Niet waar</span></label>` +
      "</div>";
  } else if (v.type === "invul") {
    invoer = `<label class="invul"><span class="sr-only">Je antwoord</span>` +
      `<input type="text" name="${naam}" autocomplete="off" autocapitalize="off" spellcheck="false">` +
      (v.eenheid ? `<span class="eenheid">${fmt(v.eenheid)}</span>` : "") + "</label>";
  }

  return `<li class="vraag" id="v${v.nr}">
    <div class="vraaginhoud">
      <div class="vraagtekst">${fmt(v.vraag)}</div>
      ${hint}
      ${invoer}
      <div class="terugkoppeling" hidden></div>
    </div>
  </li>`;
}

export function startReeks(el, data, { titel, onKlaar, onTerug }) {
  function teken() {
    const vragen = data.vragen.map((v, i) => ({
      ...v,
      nr: i,
      volgorde: v.type === "mc" || v.type === "multi" ? schud(v.opties.map((_, k) => k)) : null
    }));

    el.innerHTML = `
      <h1>${fmt(titel || data.titel || "Oefeningen")}</h1>
      ${data.intro ? `<p class="intro">${fmt(data.intro)}</p>` : ""}
      <ol class="vragen">${vragen.map(vraagHtml).join("")}</ol>
      <div class="acties"><button type="button" class="knop groot" id="nakijken">Nakijken</button></div>
      <div id="uitslag"></div>`;

    el.querySelector("#nakijken").addEventListener("click", () => nakijken(vragen));
    // Enter in een invulvak mag niets doen behalve naar het volgende veld gaan.
    el.querySelectorAll('input[type="text"]').forEach((inp) =>
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); })
    );
  }

  function lees(v) {
    const velden = [...el.querySelectorAll(`[name="q${v.nr}"]`)];
    if (v.type === "mc" || v.type === "wn") {
      const gekozen = velden.find((f) => f.checked);
      return gekozen ? gekozen.value : null;
    }
    if (v.type === "multi") return velden.filter((f) => f.checked).map((f) => Number(f.value));
    return velden[0].value.trim();
  }

  function isBeantwoord(v, ant) {
    if (v.type === "multi") return ant.length > 0;
    if (v.type === "invul") return ant !== "";
    return ant !== null;
  }

  function isJuist(v, ant) {
    if (!isBeantwoord(v, ant)) return false;
    switch (v.type) {
      case "mc": return Number(ant) === v.juist;
      case "wn": return (ant === "true") === v.juist;
      case "multi": {
        const a = [...ant].sort((x, y) => x - y).join(",");
        const j = [...v.juist].sort((x, y) => x - y).join(",");
        return a === j;
      }
      case "invul": return v.antwoorden.some((x) => gelijk(ant, x));
      default: return false;
    }
  }

  function juistTekst(v) {
    switch (v.type) {
      case "mc": return fmt(v.opties[v.juist]);
      case "wn": return v.juist ? "Waar" : "Niet waar";
      case "multi": return v.juist.map((k) => fmt(v.opties[k])).join("<br>");
      case "invul": return fmt(v.antwoorden[0]) + (v.eenheid ? " " + fmt(v.eenheid) : "");
      default: return "";
    }
  }

  function markeerOpties(v) {
    el.querySelectorAll(`[name="q${v.nr}"]`).forEach((inp) => {
      const label = inp.closest("label.optie");
      if (!label) return;
      let optieJuist = false;
      if (v.type === "mc") optieJuist = Number(inp.value) === v.juist;
      if (v.type === "multi") optieJuist = v.juist.includes(Number(inp.value));
      if (v.type === "wn") optieJuist = (inp.value === "true") === v.juist;
      if (optieJuist) label.classList.add("is-juist");
      else if (inp.checked) label.classList.add("is-fout");
    });
  }

  async function nakijken(vragen) {
    const antwoorden = vragen.map(lees);
    const open = vragen.filter((v, i) => !isBeantwoord(v, antwoorden[i])).length;
    if (open > 0) {
      const meervoud = open === 1 ? "1 vraag" : open + " vragen";
      if (!confirm(`Je hebt nog ${meervoud} niet beantwoord. Toch nakijken?`)) return;
    }

    el.querySelector("#nakijken").disabled = true;
    let score = 0;

    vragen.forEach((v, i) => {
      const li = el.querySelector("#v" + v.nr);
      const juist = isJuist(v, antwoorden[i]);
      if (juist) score++;
      li.classList.add(juist ? "juist" : "fout");
      markeerOpties(v);

      const kop = juist ? "Juist." : (isBeantwoord(v, antwoorden[i]) ? "Niet juist." : "Niet beantwoord.");
      const juistDeel = juist ? "" : `<p class="juistantwoord">Juiste antwoord: ${juistTekst(v)}</p>`;
      const uitleg = v.uitleg ? `<p class="uitleg">${fmt(v.uitleg)}</p>` : "";
      const tk = li.querySelector(".terugkoppeling");
      tk.innerHTML = `<p class="oordeel">${kop}</p>${juistDeel}${uitleg}`;
      tk.hidden = false;
    });

    el.querySelectorAll("input").forEach((inp) => { inp.disabled = true; });

    const max = vragen.length;
    const pct = score / max;
    const boodschap = pct >= 0.9
      ? "Uitstekend gewerkt."
      : pct >= 0.6
        ? "Goed bezig. Lees de uitleg bij de vragen die niet juist waren."
        : "Lees de uitleg bij de vragen en probeer de reeks opnieuw.";

    const uitslag = el.querySelector("#uitslag");
    uitslag.innerHTML = `
      <section class="uitslag" tabindex="-1">
        <h2>Score: ${score} op ${max}</h2>
        <p>${boodschap}</p>
        <p class="opslag" role="status">Je resultaat wordt opgeslagen…</p>
        <div class="acties">
          <button type="button" class="knop" id="opnieuw">Oefen opnieuw</button>
          <button type="button" class="knop secundair" id="klaar">Terug naar overzicht</button>
        </div>
      </section>`;

    const blok = uitslag.querySelector(".uitslag");
    const opslag = uitslag.querySelector(".opslag");
    const beweging = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    blok.scrollIntoView({ behavior: beweging, block: "start" });
    blok.focus({ preventScroll: true });

    uitslag.querySelector("#opnieuw").addEventListener("click", () => {
      teken();
      window.scrollTo(0, 0);
    });
    uitslag.querySelector("#klaar").addEventListener("click", onTerug);

    async function bewaar() {
      try {
        await onKlaar(score, max);
        opslag.textContent = "Je resultaat is opgeslagen. Je leerkracht ziet dat je deze reeks gemaakt hebt.";
        opslag.classList.remove("mislukt");
        opslag.classList.add("gelukt");
      } catch (fout) {
        console.error(fout);
        opslag.classList.add("mislukt");
        opslag.innerHTML = 'Opslaan is niet gelukt. Controleer je internetverbinding. <button type="button" class="knop-tekst" id="herbewaar">Probeer opnieuw op te slaan</button>';
        opslag.querySelector("#herbewaar").addEventListener("click", () => {
          opslag.textContent = "Je resultaat wordt opgeslagen…";
          bewaar();
        });
      }
    }
    bewaar();
  }

  teken();
}
