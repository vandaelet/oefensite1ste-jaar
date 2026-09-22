// Leerkrachtenpagina: nieuwe oefenreeksen uit GitHub overnemen, open/dicht zetten,
// en een overzicht van welke leerling welke reeks gemaakt heeft.

import {
  auth, db, onAuthStateChanged, meldAan, meldAf, aanmeldFoutTekst, isLeerkracht, LEERKRACHT_EMAIL,
  collection, doc, getDocs, setDoc, updateDoc, serverTimestamp
} from "./firebase-init.js?v=4";
import { esc } from "./oefening-engine.js?v=4";

const app = document.getElementById("app");
const gebruikerEl = document.getElementById("gebruiker");

let reeksen = [];
let wezen = []; // reeksen in Firestore die niet meer in het manifest staan
let leerlingen = []; // gebruikers, de leerkracht zelf niet meegeteld
let resultaten = []; // alle resultaten van alle leerlingen
let geladen = false; // reeksen + leerlingen + resultaten zijn minstens één keer opgehaald
let weergave = "reeksen"; // "reeksen" | "resultaten" | "leerling"
let gekozenLeerling = null; // uid
let zoekterm = "";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    gebruikerEl.innerHTML = "";
    app.innerHTML = `
      <section class="login">
        <h1>Leerkrachtenpagina</h1>
        <p>Meld je aan met je leerkrachtenaccount.</p>
        <p id="fout" class="melding fout" role="alert" hidden></p>
        <button type="button" class="knop groot" id="aanmelden">Aanmelden met Google</button>
      </section>`;
    app.querySelector("#aanmelden").addEventListener("click", async () => {
      try { await meldAan(); } catch (f) {
        const t = aanmeldFoutTekst(f);
        if (t) { const p = app.querySelector("#fout"); p.textContent = t; p.hidden = false; }
      }
    });
    return;
  }

  gebruikerEl.innerHTML = `
    <span class="naam">${esc(user.displayName || user.email)}</span>
    <a class="link" href="./">Leerlingenpagina</a>
    <button type="button" class="knop-tekst" id="afmelden">Afmelden</button>`;
  gebruikerEl.querySelector("#afmelden").addEventListener("click", () => meldAf());

  if (!isLeerkracht(user)) {
    app.innerHTML = `
      <h1>Geen toegang</h1>
      <p>Deze pagina is enkel voor de leerkracht. Ga terug naar <a href="./">je oefeningen</a>.</p>`;
    return;
  }

  await laad();
});

/* ------------------------------------------------------------------ */
/* Gegevens ophalen                                                    */
/* ------------------------------------------------------------------ */

async function laad(melding = "") {
  app.innerHTML = '<p class="laden">De gegevens worden opgehaald…</p>';
  try {
    const [manifestAntwoord, reeksenSnap, gebruikersSnap, resultatenSnap] = await Promise.all([
      fetch("manifest.json", { cache: "no-store" }),
      getDocs(collection(db, "reeksen")),
      getDocs(collection(db, "gebruikers")),
      getDocs(collection(db, "resultaten"))
    ]);
    if (!manifestAntwoord.ok) throw new Error("manifest.json niet gevonden");
    const manifest = await manifestAntwoord.json();

    const bestaand = new Map(reeksenSnap.docs.map((d) => [d.id, d.data()]));

    let nieuw = 0;
    const inManifest = new Set();
    const lijst = [];

    manifest.modules.forEach((m, mi) => {
      m.reeksen.forEach((r, ri) => {
        lijst.push({
          id: r.id,
          moduleId: m.id,
          moduleTitel: m.titel,
          moduleVolgorde: mi + 1,
          titel: r.titel,
          bestand: r.bestand,
          volgorde: ri + 1
        });
      });
    });

    reeksen = [];
    for (const basis of lijst) {
      inManifest.add(basis.id);
      const oud = bestaand.get(basis.id);
      if (!oud) {
        await setDoc(doc(db, "reeksen", basis.id), { ...basis, open: false, toegevoegd: serverTimestamp() });
        nieuw++;
        reeksen.push({ ...basis, open: false });
      } else {
        const verschilt = Object.keys(basis).some((k) => oud[k] !== basis[k]);
        if (verschilt) await setDoc(doc(db, "reeksen", basis.id), basis, { merge: true });
        reeksen.push({ ...basis, open: !!oud.open });
      }
    }

    wezen = [...bestaand.entries()]
      .filter(([id]) => !inManifest.has(id))
      .map(([id, d]) => ({ id, ...d }));

    leerlingen = gebruikersSnap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter((g) => (g.email || "").toLowerCase() !== LEERKRACHT_EMAIL);

    resultaten = resultatenSnap.docs.map((d) => d.data());

    geladen = true;
    const tekst = melding || (nieuw > 0
      ? `${nieuw} nieuwe ${nieuw === 1 ? "reeks" : "reeksen"} gevonden en toegevoegd. Nieuwe reeksen staan dicht tot je ze opent.`
      : "");
    render(tekst);
  } catch (fout) {
    console.error(fout);
    app.innerHTML = `<p class="melding fout" role="alert">De gegevens konden niet geladen worden: ${esc(fout.message)}. Controleer of de Firestore-regels ingesteld zijn en ververs de pagina.</p>`;
  }
}

/* ------------------------------------------------------------------ */
/* Hulpfuncties op de gegevens                                         */
/* ------------------------------------------------------------------ */

function alleModules(lijstReeksen) {
  const modules = new Map();
  for (const r of lijstReeksen) {
    if (!modules.has(r.moduleId)) modules.set(r.moduleId, { titel: r.moduleTitel, items: [] });
    modules.get(r.moduleId).items.push(r);
  }
  return modules;
}

function resultatenVan(uid) {
  return resultaten.filter((r) => r.uid === uid);
}

function resultaatVoor(uid, reeksId) {
  return resultaten.find((r) => r.uid === uid && r.reeksId === reeksId) || null;
}

function fmtDatumTijd(tijdstip) {
  if (!tijdstip || typeof tijdstip.toDate !== "function") return "–";
  const d = tijdstip.toDate();
  return d.toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" }) +
    " om " + d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
}

function pctKlasse(pct) {
  if (pct >= 80) return "score-goed";
  if (pct >= 50) return "score-matig";
  return "score-zwak";
}

function samenvattingVoor(uid) {
  const eigen = resultatenVan(uid);
  const open = reeksen.filter((r) => r.open);
  const gemaakt = eigen.filter((r) => open.some((o) => o.id === r.reeksId));
  const gemiddelde = gemaakt.length
    ? Math.round(gemaakt.reduce((som, r) => som + (r.besteScore / r.max) * 100, 0) / gemaakt.length)
    : null;
  const laatst = eigen.reduce((max, r) => {
    const t = r.laatstGemaakt && r.laatstGemaakt.toDate ? r.laatstGemaakt.toDate() : null;
    return t && (!max || t > max) ? t : max;
  }, null);
  return { aantalGemaakt: gemaakt.length, totaalOpen: open.length, gemiddelde, laatst };
}

/* ------------------------------------------------------------------ */
/* Tabbladen                                                           */
/* ------------------------------------------------------------------ */

function tabbladenHtml() {
  return `
    <nav class="tabbladen" aria-label="Onderdelen">
      <button type="button" class="tabblad${weergave !== "resultaten" ? " actief" : ""}" data-tab="reeksen">Oefeningen open/dicht</button>
      <button type="button" class="tabblad${weergave === "resultaten" ? " actief" : ""}" data-tab="resultaten">Resultaten van leerlingen</button>
    </nav>`;
}

function render(melding = "") {
  if (weergave === "leerling" && gekozenLeerling) return renderLeerlingDetail();
  if (weergave === "resultaten") return renderResultaten();
  return renderReeksen(melding);
}

function koppelTabbladen() {
  app.querySelectorAll("[data-tab]").forEach((knop) =>
    knop.addEventListener("click", () => {
      weergave = knop.dataset.tab;
      gekozenLeerling = null;
      render();
    })
  );
}

/* ------------------------------------------------------------------ */
/* Tabblad: oefeningen open/dicht                                      */
/* ------------------------------------------------------------------ */

function samenvattingVoorReeks(reeksId) {
  const aantal = new Set(resultaten.filter((r) => r.reeksId === reeksId).map((r) => r.uid)).size;
  return { aantal, totaal: leerlingen.length };
}

function schakelaarHtml(r) {
  const s = geladen ? samenvattingVoorReeks(r.id) : null;
  return `
    <li class="reeks">
      <div class="reeks-tekst">
        <strong>${esc(r.titel)}</strong>
        ${r.ontbreekt ? '<span class="status waarschuwing">Staat niet meer in manifest.json</span>' : ""}
        ${!r.ontbreekt && s ? `<span class="status">${s.aantal} van ${s.totaal} ${s.totaal === 1 ? "leerling" : "leerlingen"} gemaakt</span>` : ""}
      </div>
      <label class="schakelaar">
        <input type="checkbox" data-id="${esc(r.id)}" ${r.open ? "checked" : ""}>
        <span class="schuif" aria-hidden="true"></span>
        <span class="schakeltekst">${r.open ? "Open" : "Dicht"}</span>
      </label>
    </li>`;
}

function renderReeksen(melding) {
  const modules = alleModules(reeksen);

  let html = tabbladenHtml() + `
    <h1>Oefeningen open of dicht zetten</h1>
    <p>Nieuwe oefeningen voeg je toe op GitHub. Ze verschijnen hier automatisch, dicht, en leerlingen zien ze pas nadat je ze opent.</p>
    <div class="acties"><button type="button" class="knop secundair" id="vernieuw">Lijst vernieuwen</button></div>
    <p id="status" class="melding ${melding ? "ok" : ""}" role="status" ${melding ? "" : "hidden"}>${esc(melding)}</p>`;

  for (const [moduleId, m] of modules) {
    html += `
      <section class="module">
        <h2>${esc(m.titel)}</h2>
        <div class="acties acties-klein">
          <button type="button" class="knop-tekst" data-alles="open" data-module="${esc(moduleId)}">Alles openen</button>
          <button type="button" class="knop-tekst" data-alles="dicht" data-module="${esc(moduleId)}">Alles sluiten</button>
        </div>
        <ul class="reeksen">${m.items.map(schakelaarHtml).join("")}</ul>
      </section>`;
  }

  if (wezen.length > 0) {
    html += `
      <section class="module">
        <h2>Niet meer in de lijst op GitHub</h2>
        <ul class="reeksen">${wezen.map((r) => schakelaarHtml({ ...r, ontbreekt: true })).join("")}</ul>
      </section>`;
  }

  app.innerHTML = html;
  koppelTabbladen();

  app.querySelector("#vernieuw").addEventListener("click", () => laad());
  app.querySelectorAll('input[type="checkbox"][data-id]').forEach((cb) =>
    cb.addEventListener("change", () => zet(cb, cb.checked))
  );
  app.querySelectorAll("button[data-alles]").forEach((knop) =>
    knop.addEventListener("click", async () => {
      const open = knop.dataset.alles === "open";
      const vakjes = [...app.querySelectorAll('input[type="checkbox"][data-id]')]
        .filter((cb) => reeksen.find((r) => r.id === cb.dataset.id && r.moduleId === knop.dataset.module));
      for (const cb of vakjes) {
        if (cb.checked !== open) { cb.checked = open; await zet(cb, open); }
      }
    })
  );
}

async function zet(cb, open) {
  const status = app.querySelector("#status");
  cb.disabled = true;
  try {
    await updateDoc(doc(db, "reeksen", cb.dataset.id), { open });
    cb.closest(".schakelaar").querySelector(".schakeltekst").textContent = open ? "Open" : "Dicht";
    const reeks = reeksen.find((r) => r.id === cb.dataset.id);
    if (reeks) reeks.open = open;
  } catch (fout) {
    console.error(fout);
    cb.checked = !open;
    status.textContent = "Wijzigen is niet gelukt. Controleer je verbinding en de Firestore-regels.";
    status.className = "melding fout";
    status.hidden = false;
  } finally {
    cb.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Tabblad: resultaten van leerlingen                                  */
/* ------------------------------------------------------------------ */

function rijLeerlingHtml(l) {
  const s = samenvattingVoor(l.uid);
  return `
    <tr class="klikbaar" data-uid="${esc(l.uid)}" tabindex="0" role="button">
      <td data-label="Leerling">
        <span class="naam-cel">${esc(l.naam || l.email)}</span>
        <span class="email-cel">${esc(l.email || "")}</span>
      </td>
      <td class="cel-midden" data-label="Gemaakt">${s.aantalGemaakt} / ${s.totaalOpen}</td>
      <td class="cel-midden" data-label="Gemiddelde score">${s.gemiddelde === null ? "–" : `<span class="scorebolletje ${pctKlasse(s.gemiddelde)}">${s.gemiddelde}%</span>`}</td>
      <td data-label="Laatst actief">${s.laatst ? s.laatst.toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" }) : "Nog niet actief"}</td>
    </tr>`;
}

function renderResultaten() {
  let lijst = [...leerlingen].sort((a, b) => (a.naam || a.email || "").localeCompare(b.naam || b.email || "", "nl"));
  if (zoekterm.trim()) {
    const t = zoekterm.trim().toLowerCase();
    lijst = lijst.filter((l) => (l.naam || "").toLowerCase().includes(t) || (l.email || "").toLowerCase().includes(t));
  }

  const totaalOpen = reeksen.filter((r) => r.open).length;

  let html = tabbladenHtml() + `
    <h1>Resultaten van leerlingen</h1>`;

  if (leerlingen.length === 0) {
    html += `<p class="leeg">Er heeft nog geen enkele leerling zich aangemeld. Van zodra een leerling zich aanmeldt, verschijnt die hier.</p>`;
    app.innerHTML = html;
    koppelTabbladen();
    return;
  }

  html += `
    <p class="intro">Klik op een leerling voor een overzicht per oefenreeks. "Gemaakt" telt enkel reeksen die momenteel open staan.</p>
    <div class="acties">
      <input type="search" id="zoek" class="zoekveld" placeholder="Zoek op naam of e-mailadres" value="${esc(zoekterm)}" aria-label="Zoek een leerling">
      <button type="button" class="knop secundair" id="vernieuw2">Lijst vernieuwen</button>
    </div>`;

  if (totaalOpen === 0) {
    html += `<p class="melding">Er staat nog geen enkele oefenreeks open. Open eerst reeksen op het tabblad "Oefeningen open/dicht".</p>`;
  }

  if (lijst.length === 0) {
    html += `<p class="leeg">Geen leerling komt overeen met "${esc(zoekterm)}".</p>`;
  } else {
    html += `
      <div class="tabel-omhulsel">
        <table class="tabel">
          <thead><tr><th>Leerling</th><th class="cel-midden">Gemaakt</th><th class="cel-midden">Gemiddelde score</th><th>Laatst actief</th></tr></thead>
          <tbody>${lijst.map(rijLeerlingHtml).join("")}</tbody>
        </table>
      </div>`;
  }

  app.innerHTML = html;
  koppelTabbladen();

  app.querySelector("#vernieuw2").addEventListener("click", () => laad());
  const zoek = app.querySelector("#zoek");
  zoek.addEventListener("input", () => {
    zoekterm = zoek.value;
    renderResultaten();
    const veld = app.querySelector("#zoek");
    veld.focus();
    veld.setSelectionRange(zoekterm.length, zoekterm.length);
  });

  app.querySelectorAll("tr[data-uid]").forEach((rij) => {
    const openDetail = () => { gekozenLeerling = rij.dataset.uid; weergave = "leerling"; render(); };
    rij.addEventListener("click", openDetail);
    rij.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(); } });
  });
}

/* ------------------------------------------------------------------ */
/* Detail van één leerling                                             */
/* ------------------------------------------------------------------ */

function rijReeksHtml(r) {
  const res = resultaatVoor(gekozenLeerling, r.id);
  if (!res) {
    return `
      <li class="reeks">
        <span class="vinkje" aria-hidden="true"></span>
        <div class="reeks-tekst"><strong>${esc(r.titel)}</strong><span class="status">Nog niet gemaakt</span></div>
      </li>`;
  }
  const pct = Math.round((res.besteScore / res.max) * 100);
  return `
    <li class="reeks">
      <span class="vinkje aan" aria-hidden="true"></span>
      <div class="reeks-tekst">
        <strong>${esc(r.titel)}</strong>
        <span class="status">
          Beste score: <span class="scorebolletje ${pctKlasse(pct)}">${res.besteScore} / ${res.max} (${pct}%)</span>
          &nbsp;·&nbsp; ${res.pogingen === 1 ? "1 poging" : `${res.pogingen} pogingen`}
          &nbsp;·&nbsp; laatst gemaakt op ${fmtDatumTijd(res.laatstGemaakt)}
        </span>
      </div>
    </li>`;
}

function renderLeerlingDetail() {
  const l = leerlingen.find((x) => x.uid === gekozenLeerling);
  if (!l) { weergave = "resultaten"; return renderResultaten(); }

  const eigenResultaten = resultatenVan(l.uid);
  const bekendeIds = new Set(reeksen.map((r) => r.id));
  const buitenManifest = eigenResultaten.filter((r) => !bekendeIds.has(r.reeksId));

  const openPerModule = alleModules(reeksen.filter((r) => r.open));

  let html = tabbladenHtml() + `
    <div class="terugbalk"><button type="button" class="knop-tekst" id="terug-resultaten">Terug naar alle leerlingen</button></div>
    <h1>${esc(l.naam || l.email)}</h1>
    <p class="intro">${esc(l.email || "")}</p>`;

  if (openPerModule.size === 0) {
    html += `<p class="leeg">Er staat nog geen enkele oefenreeks open.</p>`;
  }

  for (const [, m] of openPerModule) {
    html += `
      <section class="module">
        <h2>${esc(m.titel)}</h2>
        <ul class="reeksen">${m.items.map(rijReeksHtml).join("")}</ul>
      </section>`;
  }

  if (buitenManifest.length > 0) {
    html += `
      <section class="module">
        <h2>Andere gemaakte oefeningen</h2>
        <p class="intro">Deze reeksen staan niet (meer) open, maar de leerling maakte ze wel.</p>
        <ul class="reeksen">${buitenManifest.map((res) => {
          const pct = Math.round((res.besteScore / res.max) * 100);
          return `
            <li class="reeks">
              <span class="vinkje aan" aria-hidden="true"></span>
              <div class="reeks-tekst">
                <strong>${esc(res.reeksTitel || res.reeksId)}</strong>
                <span class="status">
                  Beste score: <span class="scorebolletje ${pctKlasse(pct)}">${res.besteScore} / ${res.max} (${pct}%)</span>
                  &nbsp;·&nbsp; ${res.pogingen === 1 ? "1 poging" : `${res.pogingen} pogingen`}
                  &nbsp;·&nbsp; laatst gemaakt op ${fmtDatumTijd(res.laatstGemaakt)}
                </span>
              </div>
            </li>`;
        }).join("")}</ul>
      </section>`;
  }

  app.innerHTML = html;
  koppelTabbladen();
  app.querySelector("#terug-resultaten").addEventListener("click", () => {
    gekozenLeerling = null;
    weergave = "resultaten";
    render();
  });
}
