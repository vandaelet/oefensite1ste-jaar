// Leerkrachtenpagina (versie 1): nieuwe oefenreeksen uit GitHub overnemen en open/dicht zetten.
// Het overzicht van wie wat gemaakt heeft komt in de volgende stap.

import {
  auth, db, onAuthStateChanged, meldAan, meldAf, aanmeldFoutTekst, isLeerkracht,
  collection, doc, getDocs, setDoc, updateDoc, serverTimestamp
} from "./firebase-init.js";
import { esc } from "./oefening-engine.js";

const app = document.getElementById("app");
const gebruikerEl = document.getElementById("gebruiker");

let reeksen = [];
let wezen = []; // reeksen in Firestore die niet meer in het manifest staan

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

async function laad(melding = "") {
  app.innerHTML = '<p class="laden">De lijst wordt opgehaald…</p>';
  try {
    const antwoord = await fetch("manifest.json", { cache: "no-store" });
    if (!antwoord.ok) throw new Error("manifest.json niet gevonden");
    const manifest = await antwoord.json();

    const snap = await getDocs(collection(db, "reeksen"));
    const bestaand = new Map(snap.docs.map((d) => [d.id, d.data()]));

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

    const tekst = melding || (nieuw > 0
      ? `${nieuw} nieuwe ${nieuw === 1 ? "reeks" : "reeksen"} gevonden en toegevoegd. Nieuwe reeksen staan dicht tot je ze opent.`
      : "");
    toon(tekst);
  } catch (fout) {
    console.error(fout);
    app.innerHTML = `<p class="melding fout" role="alert">De lijst kon niet geladen worden: ${esc(fout.message)}. Controleer of de Firestore-regels ingesteld zijn en ververs de pagina.</p>`;
  }
}

function schakelaarHtml(r) {
  return `
    <li class="reeks">
      <div class="reeks-tekst">
        <strong>${esc(r.titel)}</strong>
        ${r.ontbreekt ? '<span class="status waarschuwing">Staat niet meer in manifest.json</span>' : ""}
      </div>
      <label class="schakelaar">
        <input type="checkbox" data-id="${esc(r.id)}" ${r.open ? "checked" : ""}>
        <span class="schuif" aria-hidden="true"></span>
        <span class="schakeltekst">${r.open ? "Open" : "Dicht"}</span>
      </label>
    </li>`;
}

function toon(melding) {
  const modules = new Map();
  for (const r of reeksen) {
    if (!modules.has(r.moduleId)) modules.set(r.moduleId, { titel: r.moduleTitel, items: [] });
    modules.get(r.moduleId).items.push(r);
  }

  let html = `
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
