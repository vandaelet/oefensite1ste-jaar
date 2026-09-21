// Oefenmotor: toont de vragen van één reeks, kijkt ze na en geeft feedback.
//
// Vraagtypes:
//   mc        één juist antwoord kiezen
//   multi     meerdere juiste antwoorden kiezen
//   wn        waar of niet waar
//   invul     zelf een antwoord typen
//   meerinvul meerdere invulvakjes in één vraag
//   sorteer   blokjes in de juiste volgorde slepen
//   koppel    blokjes bij de juiste term slepen
//   indeel    blokjes in de juiste groep slepen
//   gaten     woorden in de gaten van een zin slepen
// Elke vraag mag "uitdaging": true hebben.

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

// Zoals schud, maar de volgorde mag niet toevallig gelijk zijn aan de oorspronkelijke.
function schudAnders(lijst) {
  let resultaat = schud(lijst);
  for (let poging = 0; poging < 10 && lijst.length > 2 && resultaat.every((x, i) => x === lijst[i]); poging++) {
    resultaat = schud(lijst);
  }
  return resultaat;
}

/* ------------------------------------------------------------------ */
/* Sleepoefeningen                                                     */
/* ------------------------------------------------------------------ */

const PLAATS_TYPES = ["sorteer", "koppel", "indeel", "gaten"];
const HINT_PLAATS =
  "Sleep de blokjes naar de juiste plaats. Je kunt ook eerst op een blokje klikken of tikken en daarna op de plaats.";

// Beschrijf welke blokjes en plaatsen een vraag heeft.
function maakSpec(v) {
  if (v.type === "sorteer") {
    const chips = v.items.map((t, i) => ({ id: "c" + i, tekst: t }));
    const zones = v.items.map((t, i) => ({
      id: "z" + i,
      label: v.labels && v.labels[i] !== undefined ? v.labels[i] : (i + 1) + ".",
      cap: 1,
      verwacht: t
    }));
    return { layout: "slots", chips, zones, bank: schudAnders(chips.map((c) => c.id)) };
  }
  if (v.type === "koppel") {
    const teksten = [...v.paren.map((p) => p[1]), ...(v.extra || [])];
    const chips = teksten.map((t, i) => ({ id: "c" + i, tekst: t }));
    const zones = v.paren.map((p, i) => ({ id: "z" + i, label: p[0], cap: 1, verwacht: p[1] }));
    return { layout: "rijen", chips, zones, bank: schud(chips.map((c) => c.id)) };
  }
  if (v.type === "indeel") {
    const chips = v.items.map((it, i) => ({ id: "c" + i, tekst: it[0], cat: "z" + it[1] }));
    const zones = v.categorieen.map((t, i) => ({ id: "z" + i, label: t, cap: 0 }));
    return { layout: "bakken", chips, zones, bank: schud(chips.map((c) => c.id)) };
  }
  // gaten
  const teksten = [...v.antwoorden, ...(v.extra || [])];
  const chips = teksten.map((t, i) => ({ id: "c" + i, tekst: t }));
  const zones = v.antwoorden.map((a, i) => ({ id: "z" + i, label: "", cap: 1, verwacht: a }));
  return { layout: "tekst", chips, zones, bank: schud(chips.map((c) => c.id)) };
}

function plaatsHtml(v) {
  const s = v.spec;
  const bank = '<div class="bank" data-bank aria-label="Blokjes om te plaatsen"></div>';
  const hint = `<p class="hint plaats-hint">${HINT_PLAATS}</p>`;
  const zone = (z, extra = "", tag = "div") =>
    `<${tag} class="zone ${extra}" data-zone="${z.id}" tabindex="0" role="group" aria-label="${esc(z.label || "Plaats")}">` +
    `<span class="zone-inhoud" data-inhoud="${z.id}"></span></${tag}>`;

  if (s.layout === "slots") {
    const slots = s.zones.map((z) =>
      `<li class="slot"><span class="zone-label">${fmt(z.label)}</span>${zone(z)}</li>`
    ).join("");
    return `<div class="plaats" data-layout="slots">${hint}${bank}<ol class="slots">${slots}</ol></div>`;
  }
  if (s.layout === "rijen") {
    const rijen = s.zones.map((z) =>
      `<div class="rij"><span class="rij-label">${fmt(z.label)}</span>${zone(z)}</div>`
    ).join("");
    return `<div class="plaats" data-layout="rijen">${hint}${bank}<div class="rijen">${rijen}</div></div>`;
  }
  if (s.layout === "bakken") {
    const bakken = s.zones.map((z) =>
      `<section class="bak"><h3 class="bak-kop">${fmt(z.label)}</h3>${zone(z, "zone-bak")}</section>`
    ).join("");
    return `<div class="plaats" data-layout="bakken">${hint}${bank}<div class="bakken">${bakken}</div></div>`;
  }
  // tekst met gaten
  const delen = v.vraag.split(/\[\[(\d+)\]\]/);
  let tekst = "";
  delen.forEach((deel, i) => {
    if (i % 2 === 0) tekst += fmt(deel);
    else {
      const z = s.zones[Number(deel) - 1];
      tekst += z ? `<span class="gat">${zone(z, "zone-gat", "span")}</span>` : "";
    }
  });
  return `<div class="plaats" data-layout="tekst">${hint}<div class="gaten-tekst">${tekst}</div>${bank}</div>`;
}

// Maakt een sleepoefening levend: slepen met muis of vinger, of klikken/tikken en plaatsen.
function initPlaats(root, spec) {
  const plaats = {}; // blokje-id -> plaats-id (of null = nog in de bank)
  spec.chips.forEach((c) => { plaats[c.id] = null; });
  const chipDoc = Object.fromEntries(spec.chips.map((c) => [c.id, c]));
  const zoneDoc = Object.fromEntries(spec.zones.map((z) => [z.id, z]));

  let gekozen = null;
  let vergrendeld = false;
  let resultaat = null;
  let sleep = null;
  let laatsteAanraking = 0;

  function chipHtml(c) {
    const klassen = ["chip"];
    if (gekozen === c.id) klassen.push("gekozen");
    if (resultaat && resultaat.chips[c.id] !== undefined) klassen.push(resultaat.chips[c.id] ? "is-juist" : "is-fout");
    return `<button type="button" class="${klassen.join(" ")}" data-chip="${c.id}" aria-pressed="${gekozen === c.id}"${vergrendeld ? " disabled" : ""}>${fmt(c.tekst)}</button>`;
  }

  function render() {
    const actief = document.activeElement;
    const focusId = actief && actief.dataset ? actief.dataset.chip : null;

    const bankEl = root.querySelector("[data-bank]");
    bankEl.innerHTML = spec.bank.filter((id) => plaats[id] === null).map((id) => chipHtml(chipDoc[id])).join("");
    bankEl.classList.toggle("doel", gekozen !== null && plaats[gekozen] !== null && !vergrendeld);

    for (const z of spec.zones) {
      root.querySelector(`[data-inhoud="${z.id}"]`).innerHTML =
        spec.chips.filter((c) => plaats[c.id] === z.id).map(chipHtml).join("");
      const zEl = root.querySelector(`[data-zone="${z.id}"]`);
      zEl.classList.toggle("doel", gekozen !== null && !vergrendeld);
      zEl.classList.remove("is-juist", "is-fout");
      if (resultaat && z.cap === 1) zEl.classList.add(resultaat.zones[z.id] ? "is-juist" : "is-fout");
    }

    if (focusId) {
      const terug = root.querySelector(`[data-chip="${focusId}"]`);
      if (terug) terug.focus();
    }
  }

  function verplaats(chipId, zoneId) {
    const oud = plaats[chipId];
    if (zoneId === oud) return;
    if (zoneId === null) { plaats[chipId] = null; return; }
    if (zoneDoc[zoneId].cap === 1) {
      const bezetter = spec.chips.find((c) => c.id !== chipId && plaats[c.id] === zoneId);
      if (bezetter) plaats[bezetter.id] = oud; // wisselen (oud = null betekent: terug naar de bank)
    }
    plaats[chipId] = zoneId;
  }

  function beoordeel() {
    const zones = {};
    const chips = {};
    let alles = true;
    for (const z of spec.zones) {
      const erin = spec.chips.filter((c) => plaats[c.id] === z.id);
      if (z.cap === 1) {
        const ok = erin.length === 1 && erin[0].tekst === z.verwacht;
        zones[z.id] = ok;
        if (!ok) alles = false;
        if (erin.length === 1) chips[erin[0].id] = ok;
      } else {
        erin.forEach((c) => {
          const ok = c.cat === z.id;
          chips[c.id] = ok;
          if (!ok) alles = false;
        });
      }
    }
    spec.chips.forEach((c) => {
      if (c.cat !== undefined && plaats[c.id] === null) { chips[c.id] = false; alles = false; }
    });
    return { juist: alles, zones, chips };
  }

  /* klikken en tikken: één blokje kiezen en dan een plaats kiezen */
  function activeer(doel) {
    const chipEl = doel.closest("[data-chip]");
    const zoneEl = doel.closest("[data-zone]");
    const bankEl = doel.closest("[data-bank]");

    if (chipEl) {
      const id = chipEl.dataset.chip;
      if (gekozen && gekozen !== id) {
        const plek = plaats[id];
        if (plek === null && plaats[gekozen] === null) gekozen = id; // beide in de bank: selectie wisselt
        else { verplaats(gekozen, plek); gekozen = null; }
      } else {
        gekozen = gekozen === id ? null : id;
      }
      render();
      return;
    }
    if (gekozen && zoneEl) { verplaats(gekozen, zoneEl.dataset.zone); gekozen = null; render(); return; }
    if (gekozen && bankEl) { verplaats(gekozen, null); gekozen = null; render(); }
  }

  // Muis, vinger en toetsenbord (Enter of spatie geeft een click zonder aanraking).
  root.addEventListener("click", (e) => {
    if (vergrendeld) return;
    if (e.detail !== 0 && performance.now() - laatsteAanraking < 700) return; // al afgehandeld bij pointerup
    activeer(e.target);
  });

  /* toetsenbord: blokje kiezen met Enter of spatie, daarna een plaats met Enter of spatie */
  root.addEventListener("keydown", (e) => {
    if (vergrendeld || (e.key !== "Enter" && e.key !== " ")) return;
    if (gekozen && e.target.matches && e.target.matches("[data-zone]")) {
      e.preventDefault();
      const zoneId = e.target.dataset.zone;
      verplaats(gekozen, zoneId);
      gekozen = null;
      render();
      const zEl = root.querySelector(`[data-zone="${zoneId}"]`);
      if (zEl) zEl.focus();
    }
  });

  /* slepen (muis en vinger) */
  function doelOnder(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const zone = el.closest("[data-zone]");
    if (zone && root.contains(zone)) return { zone: zone.dataset.zone, el: zone };
    const bank = el.closest("[data-bank]");
    if (bank && root.contains(bank)) return { bank: true, el: bank };
    return null;
  }

  function wisDoelen() {
    root.querySelectorAll(".boven").forEach((el) => el.classList.remove("boven"));
  }

  function opruimen() {
    document.removeEventListener("pointermove", beweeg);
    document.removeEventListener("pointerup", los);
    document.removeEventListener("pointercancel", annuleer);
    if (sleep && sleep.spook) sleep.spook.remove();
    root.querySelectorAll(".sleept").forEach((el) => el.classList.remove("sleept"));
    wisDoelen();
    sleep = null;
  }

  function beweeg(e) {
    if (!sleep || e.pointerId !== sleep.pid) return;
    if (!sleep.actief) {
      if (sleep.id === null || Math.hypot(e.clientX - sleep.x, e.clientY - sleep.y) < 8) return;
      const bron = root.querySelector(`[data-chip="${sleep.id}"]`);
      if (!bron) { opruimen(); return; }
      sleep.actief = true;
      const r = bron.getBoundingClientRect();
      sleep.dx = e.clientX - r.left;
      sleep.dy = e.clientY - r.top;
      const spook = bron.cloneNode(true);
      spook.classList.add("spook");
      spook.classList.remove("gekozen");
      spook.removeAttribute("data-chip");
      spook.style.minWidth = r.width + "px";
      document.body.appendChild(spook);
      sleep.spook = spook;
      bron.classList.add("sleept");
      gekozen = null;
    }
    sleep.spook.style.left = e.clientX - sleep.dx + "px";
    sleep.spook.style.top = e.clientY - sleep.dy + "px";
    wisDoelen();
    const doel = doelOnder(e.clientX, e.clientY);
    if (doel) doel.el.classList.add("boven");
  }

  function los(e) {
    if (!sleep || e.pointerId !== sleep.pid) return;
    const s = sleep;
    const doel = s.actief ? doelOnder(e.clientX, e.clientY) : null;
    opruimen();
    laatsteAanraking = performance.now();
    if (!s.actief) { activeer(s.target); return; } // een tik
    if (doel) verplaats(s.id, doel.bank ? null : doel.zone);
    render();
  }

  function annuleer() {
    const was = sleep && sleep.actief;
    opruimen();
    if (was) render();
  }

  root.addEventListener("pointerdown", (e) => {
    if (vergrendeld || sleep || (e.pointerType === "mouse" && e.button !== 0)) return;
    const chipEl = e.target.closest("[data-chip]");
    sleep = {
      id: chipEl ? chipEl.dataset.chip : null,
      target: e.target,
      x: e.clientX,
      y: e.clientY,
      actief: false,
      pid: e.pointerId
    };
    document.addEventListener("pointermove", beweeg);
    document.addEventListener("pointerup", los);
    document.addEventListener("pointercancel", annuleer);
  });

  render();

  return {
    isBeantwoord: () => Object.values(plaats).some((z) => z !== null),
    beoordeel,
    vergrendel(uitslag) {
      vergrendeld = true;
      resultaat = uitslag;
      gekozen = null;
      render();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Vragen tonen                                                        */
/* ------------------------------------------------------------------ */

function badge(v) {
  return v.uitdaging ? '<span class="badge">Uitdaging</span>' : "";
}

function invulVak(naam, eenheid) {
  return `<input type="text" name="${naam}" autocomplete="off" autocapitalize="off" spellcheck="false">` +
    (eenheid ? `<span class="eenheid">${fmt(eenheid)}</span>` : "");
}

function vraagHtml(v) {
  const naam = "q" + v.nr;
  let kop = `<div class="vraagtekst">${badge(v)}${fmt(v.vraag)}</div>`;
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
    invoer = `<label class="invul"><span class="sr-only">Je antwoord</span>${invulVak(naam, v.eenheid)}</label>`;
  } else if (v.type === "meerinvul") {
    invoer = '<div class="velden">' + v.velden.map((f, k) =>
      `<label class="veld"><span class="veldlabel">${fmt(f.label)}</span>${invulVak(naam + "_" + k, f.eenheid)}</label>`
    ).join("") + "</div>";
  } else if (PLAATS_TYPES.includes(v.type)) {
    invoer = plaatsHtml(v);
    if (v.type === "gaten") kop = v.uitdaging ? `<div class="vraagtekst">${badge(v)}</div>` : "";
  } else {
    invoer = '<p class="melding fout">Dit vraagtype wordt niet ondersteund. Ververs de pagina met Ctrl+F5 en probeer opnieuw.</p>';
  }

  return `<li class="vraag" id="v${v.nr}">
    <div class="vraaginhoud">
      ${kop}
      ${hint}
      ${invoer}
      <div class="terugkoppeling" hidden></div>
    </div>
  </li>`;
}

/* ------------------------------------------------------------------ */
/* Een reeks afwerken                                                  */
/* ------------------------------------------------------------------ */

export function startReeks(el, data, { titel, onKlaar, onTerug }) {
  function teken() {
    const vragen = data.vragen.map((v, i) => {
      const vraag = {
        ...v,
        nr: i,
        volgorde: v.type === "mc" || v.type === "multi" ? schud(v.opties.map((_, k) => k)) : null
      };
      if (PLAATS_TYPES.includes(v.type)) vraag.spec = maakSpec(vraag);
      return vraag;
    });

    el.innerHTML = `
      <h1>${fmt(titel || data.titel || "Oefeningen")}</h1>
      ${data.intro ? `<p class="intro">${fmt(data.intro)}</p>` : ""}
      <ol class="vragen">${vragen.map(vraagHtml).join("")}</ol>
      <div class="acties"><button type="button" class="knop groot" id="nakijken">Nakijken</button></div>
      <div id="uitslag"></div>`;

    vragen.forEach((v) => {
      if (v.spec) v.ctrl = initPlaats(el.querySelector(`#v${v.nr} .plaats`), v.spec);
    });

    el.querySelector("#nakijken").addEventListener("click", () => nakijken(vragen));
    // Enter in een invulvak mag de pagina niet versturen of iets nakijken.
    el.querySelectorAll('input[type="text"]').forEach((inp) =>
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); })
    );
  }

  function velden(v) {
    return [...el.querySelectorAll(`[name="q${v.nr}"], [name^="q${v.nr}_"]`)];
  }

  function lees(v) {
    const vs = velden(v);
    if (v.type === "mc" || v.type === "wn") {
      const gekozen = vs.find((f) => f.checked);
      return gekozen ? gekozen.value : null;
    }
    if (v.type === "multi") return vs.filter((f) => f.checked).map((f) => Number(f.value));
    if (v.type === "invul") return vs[0].value.trim();
    if (v.type === "meerinvul") return vs.map((f) => f.value.trim());
    return null;
  }

  function isBeantwoord(v, ant) {
    if (v.ctrl) return v.ctrl.isBeantwoord();
    if (v.type === "multi") return ant.length > 0;
    if (v.type === "invul") return ant !== "";
    if (v.type === "meerinvul") return ant.some((x) => x !== "");
    return ant !== null;
  }

  function isJuist(v, ant) {
    if (v.ctrl) return v.ctrl.beoordeel().juist;
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
      case "meerinvul": return v.velden.every((f, k) => f.antwoorden.some((x) => gelijk(ant[k], x)));
      default: return false;
    }
  }

  function juistTekst(v) {
    switch (v.type) {
      case "mc": return fmt(v.opties[v.juist]);
      case "wn": return v.juist ? "Waar" : "Niet waar";
      case "multi": return v.juist.map((k) => fmt(v.opties[k])).join("<br>");
      case "invul": return fmt(v.antwoorden[0]) + (v.eenheid ? " " + fmt(v.eenheid) : "");
      case "meerinvul":
        return v.velden.map((f) => `${fmt(f.label)} <strong>${fmt(f.antwoorden[0])}</strong>${f.eenheid ? " " + fmt(f.eenheid) : ""}`).join("<br>");
      case "sorteer": return v.items.map(fmt).join("&nbsp;&nbsp;;&nbsp;&nbsp;");
      case "koppel": return v.paren.map((p) => `${fmt(p[0])} <strong>&rarr;</strong> ${fmt(p[1])}`).join("<br>");
      case "indeel":
        return v.categorieen.map((c, i) =>
          `<strong>${fmt(c)}</strong>: ` + v.items.filter((it) => it[1] === i).map((it) => fmt(it[0])).join(",&nbsp; ")
        ).join("<br>");
      case "gaten":
        return v.vraag.split(/\[\[(\d+)\]\]/).map((deel, i) =>
          i % 2 === 0 ? fmt(deel) : `<strong>${fmt(v.antwoorden[Number(deel) - 1] || "")}</strong>`
        ).join("");
      default: return "";
    }
  }

  function markeerOpties(v) {
    velden(v).forEach((inp, k) => {
      if (inp.type === "text") {
        let ok;
        if (v.type === "invul") ok = v.antwoorden.some((x) => gelijk(inp.value, x));
        else ok = v.velden[k].antwoorden.some((x) => gelijk(inp.value, x));
        inp.classList.add(ok ? "is-juist" : "is-fout");
        return;
      }
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
      const beantwoord = isBeantwoord(v, antwoorden[i]);
      const juist = isJuist(v, antwoorden[i]);
      if (juist) score++;
      li.classList.add(juist ? "juist" : "fout");

      if (v.ctrl) v.ctrl.vergrendel(v.ctrl.beoordeel());
      else markeerOpties(v);

      const kop = juist ? "Juist." : (beantwoord ? "Niet juist." : "Niet beantwoord.");
      const juistDeel = juist ? "" : `<p class="juistantwoord">Juiste antwoord:<br>${juistTekst(v)}</p>`;
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
