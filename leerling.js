// Leerlingenpagina: aanmelden, overzicht van open oefenreeksen, oefenen en resultaten opslaan.

import {
  auth, db, onAuthStateChanged, meldAan, meldAf, aanmeldFoutTekst,
  isSchoolAccount, isLeerkracht,
  collection, doc, getDocs, setDoc, query, where, serverTimestamp
} from "./firebase-init.js?v=4";
import { startReeks, esc } from "./oefening-engine.js?v=4";

const app = document.getElementById("app");
const gebruikerEl = document.getElementById("gebruiker");

let gebruiker = null;
let reeksen = [];
let resultaten = {}; // reeksId -> resultaat van deze leerling
let loginMelding = "";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    gebruiker = null;
    gebruikerEl.innerHTML = "";
    toonLogin();
    return;
  }
  if (!isSchoolAccount(user)) {
    loginMelding = `Het account ${user.email} hoort niet bij de school. Meld je aan met je schoolaccount dat eindigt op @svsl.be.`;
    await meldAf();
    return;
  }
  gebruiker = user;
  toonGebruiker();
  app.innerHTML = '<p class="laden">Je oefeningen worden opgehaald…</p>';
  try {
    await profielOpslaan();
    await laadGegevens();
    toonOverzicht();
  } catch (fout) {
    console.error(fout);
    toonFout("Je oefeningen konden niet geladen worden. Ververs de pagina. Lukt het nog niet, meld dit dan aan je leerkracht.");
  }
});

function naamVan(user) {
  return user.displayName || user.email;
}

function toonGebruiker() {
  gebruikerEl.innerHTML = `
    <span class="naam">${esc(naamVan(gebruiker))}</span>
    ${isLeerkracht(gebruiker) ? '<a class="link" href="leerkracht.html">Leerkrachtenpagina</a>' : ""}
    <button type="button" class="knop-tekst" id="afmelden">Afmelden</button>`;
  gebruikerEl.querySelector("#afmelden").addEventListener("click", () => meldAf());
}

function toonLogin() {
  const melding = loginMelding;
  loginMelding = "";
  app.innerHTML = `
    <section class="login">
      <h1>Oefen wiskunde</h1>
      <p>Meld je aan met je schoolaccount om oefeningen te maken. Je leerkracht ziet welke oefeningen je gemaakt hebt.</p>
      ${melding ? `<p class="melding fout" role="alert">${esc(melding)}</p>` : ""}
      <button type="button" class="knop groot" id="aanmelden">Aanmelden met Google</button>
    </section>`;
  app.querySelector("#aanmelden").addEventListener("click", async () => {
    try {
      await meldAan();
    } catch (fout) {
      const tekst = aanmeldFoutTekst(fout);
      if (tekst) { loginMelding = tekst; toonLogin(); }
    }
  });
}

function toonFout(tekst) {
  app.innerHTML = `<p class="melding fout" role="alert">${esc(tekst)}</p>`;
}

async function profielOpslaan() {
  await setDoc(doc(db, "gebruikers", gebruiker.uid), {
    uid: gebruiker.uid,
    naam: naamVan(gebruiker),
    email: gebruiker.email,
    laatsteLogin: serverTimestamp()
  }, { merge: true });
}

async function laadGegevens() {
  const [reeksSnap, resultaatSnap] = await Promise.all([
    getDocs(query(collection(db, "reeksen"), where("open", "==", true))),
    getDocs(query(collection(db, "resultaten"), where("uid", "==", gebruiker.uid)))
  ]);
  reeksen = reeksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  reeksen.sort((a, b) =>
    (a.moduleVolgorde ?? 0) - (b.moduleVolgorde ?? 0) || (a.volgorde ?? 0) - (b.volgorde ?? 0)
  );
  resultaten = {};
  resultaatSnap.docs.forEach((d) => {
    const r = d.data();
    resultaten[r.reeksId] = r;
  });
}

function statusTekst(reeksId) {
  const r = resultaten[reeksId];
  if (!r) return "Nog niet gemaakt";
  const keer = r.pogingen === 1 ? "1 poging" : `${r.pogingen} pogingen`;
  return `Gemaakt. Beste score: ${r.besteScore} op ${r.max} (${keer})`;
}

function toonOverzicht() {
  window.scrollTo(0, 0);
  if (reeksen.length === 0) {
    app.innerHTML = `
      <h1>Mijn oefeningen</h1>
      <p class="leeg">Er staan nog geen oefeningen open. Je leerkracht zet ze open zodra je ze kunt maken. Kom later terug.</p>`;
    return;
  }

  const modules = new Map();
  for (const r of reeksen) {
    if (!modules.has(r.moduleId)) modules.set(r.moduleId, { titel: r.moduleTitel, items: [] });
    modules.get(r.moduleId).items.push(r);
  }

  let html = "<h1>Mijn oefeningen</h1>";
  for (const [, m] of modules) {
    html += `<section class="module"><h2>${esc(m.titel)}</h2><ul class="reeksen">`;
    for (const r of m.items) {
      const gemaakt = !!resultaten[r.id];
      html += `
        <li class="reeks">
          <span class="vinkje${gemaakt ? " aan" : ""}" aria-hidden="true"></span>
          <div class="reeks-tekst">
            <strong>${esc(r.titel)}</strong>
            <span class="status">${esc(statusTekst(r.id))}</span>
          </div>
          <button type="button" class="knop${gemaakt ? " secundair" : ""}" data-id="${esc(r.id)}">${gemaakt ? "Oefen opnieuw" : "Start"}</button>
        </li>`;
    }
    html += "</ul></section>";
  }
  app.innerHTML = html;

  app.querySelectorAll("button[data-id]").forEach((knop) =>
    knop.addEventListener("click", () => toonOefening(reeksen.find((r) => r.id === knop.dataset.id)))
  );
}

async function toonOefening(reeks) {
  window.scrollTo(0, 0);
  app.innerHTML = '<p class="laden">De oefeningen worden geladen…</p>';
  try {
    const antwoord = await fetch(reeks.bestand, { cache: "no-store" });
    if (!antwoord.ok) throw new Error("Bestand niet gevonden: " + reeks.bestand);
    const data = await antwoord.json();

    app.innerHTML = `
      <div class="terugbalk"><button type="button" class="knop-tekst" id="terug">Terug naar overzicht</button></div>
      <div id="reeks"></div>`;
    app.querySelector("#terug").addEventListener("click", toonOverzicht);

    startReeks(app.querySelector("#reeks"), data, {
      titel: reeks.titel,
      onKlaar: (score, max) => bewaarResultaat(reeks, score, max),
      onTerug: toonOverzicht
    });
  } catch (fout) {
    console.error(fout);
    toonFout("Deze oefeningen konden niet geladen worden. Probeer het later opnieuw of meld dit aan je leerkracht.");
  }
}

async function bewaarResultaat(reeks, score, max) {
  const vorig = resultaten[reeks.id];
  const data = {
    uid: gebruiker.uid,
    naam: naamVan(gebruiker),
    email: gebruiker.email,
    reeksId: reeks.id,
    moduleId: reeks.moduleId,
    reeksTitel: reeks.titel,
    score,
    max,
    besteScore: Math.max(score, vorig ? vorig.besteScore : 0),
    pogingen: (vorig ? vorig.pogingen : 0) + 1,
    laatstGemaakt: serverTimestamp()
  };
  await setDoc(doc(db, "resultaten", `${gebruiker.uid}_${reeks.id}`), data);
  resultaten[reeks.id] = { ...data, laatstGemaakt: new Date() };
}
