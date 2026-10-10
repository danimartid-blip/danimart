// Danimart: tablero del proyecto. Sin backend: lee y escribe las pestañas
// bitacora_* de la planilla con el login de Google del propio usuario.
// Cualquier persona o herramienta que edite esas pestañas actualiza la app.
(() => {
  const api = () => window.SheetsApi;
  const TAB = {
    metas: { hoja: "bitacora_metas", cols: ["id", "orden", "titulo", "detalle", "objetivo", "lograda"] },
    tareas: { hoja: "bitacora_tareas", cols: ["id", "titulo", "detalle", "quien", "estado", "creada", "vence", "hecha", "meta"] },
    ideas: { hoja: "bitacora_ideas", cols: ["id", "titulo", "detalle", "area", "estado", "creada"] },
    registro: { hoja: "bitacora_registro", cols: ["id", "fecha", "tipo", "titulo", "texto"] },
    apoyo: { hoja: "bitacora_apoyo", cols: ["id", "orden", "titulo", "nota", "url"] },
  };
  const FECHAS = { metas: ["objetivo", "lograda"], tareas: ["creada", "vence", "hecha"], ideas: ["creada"], registro: ["fecha"], apoyo: [] };
  const VISTAS = ["hoy", "ruta", "tareas", "ideas", "diario", "mas"];
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  const S = { estado: {}, metas: [], tareas: [], ideas: [], registro: [], apoyo: [], vista: "hoy", filtro: "Daniel", area: "todas", abierta: null, metaAbierta: null, animar: true, cargado: false };
  try { S.filtro = localStorage.getItem("dm_filtro") || "Daniel"; } catch { /* sin almacenamiento */ }

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const letra = (n) => String.fromCharCode(64 + n);
  const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const p2 = (n) => String(n).padStart(2, "0");
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  const dnum = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
  const iso = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  const fmt = (s) => { if (!isDate(s)) return ""; const [y, m, d] = s.split("-").map(Number); return `${d} ${MES[m - 1]}${y !== new Date().getFullYear() ? " " + y : ""}`; };
  const nuevoId = (pref) => pref + Date.now().toString(36);

  /** Acepta lo que venga de la planilla: 2026-10-14, 14/10/2026 o 14-10-2026. */
  function normFecha(v) {
    const s = String(v ?? "").trim();
    if (isDate(s)) return s;
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    return m ? `${m[3]}-${p2(m[2])}-${p2(m[1])}` : "";
  }
  function plazo(s) {
    if (!isDate(s)) return { txt: "sin fecha", late: false, n: null };
    const n = dnum(s) - dnum(hoy());
    if (n < 0) return { txt: `${fmt(s)} · atrasada ${-n} ${n === -1 ? "día" : "días"}`, late: true, n };
    if (n === 0) return { txt: `${fmt(s)} · hoy`, late: false, n };
    return { txt: `${fmt(s)} · en ${n} ${n === 1 ? "día" : "días"}`, late: false, n };
  }
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3400); }

  // ---------- Datos ----------
  async function load() {
    const nombres = Object.keys(TAB);
    const res = await Promise.all([
      api().readRange("bitacora_estado!A2:B40"),
      ...nombres.map((n) => api().readRange(`${TAB[n].hoja}!A2:${letra(TAB[n].cols.length)}`)),
    ]);
    S.estado = {};
    for (const r of res[0]) if (r[0]) S.estado[String(r[0]).trim()] = String(r[1] ?? "").trim();
    nombres.forEach((n, i) => {
      S[n] = res[i + 1].filter((r) => r && String(r[0] ?? "").trim()).map((r) => {
        const o = {};
        TAB[n].cols.forEach((c, j) => { o[c] = String(r[j] ?? "").trim(); });
        for (const c of FECHAS[n]) o[c] = normFecha(o[c]);
        return o;
      });
    });
    S.cargado = true;
  }

  /** La fila se busca por id justo antes de escribir: si alguien ordenó o
   * insertó filas en la planilla, el número que teníamos ya no sirve. */
  async function filaDe(hoja, id) {
    const col = await api().readRange(`${hoja}!A1:A`);
    const i = col.findIndex((r) => String((r && r[0]) ?? "").trim() === id);
    if (i < 0) throw new Error("Esa fila ya no está en la planilla");
    return i + 1;
  }
  async function guardar(tab, o) {
    const t = TAB[tab];
    const f = await filaDe(t.hoja, o.id);
    await api().updateRange(`${t.hoja}!A${f}:${letra(t.cols.length)}${f}`, [t.cols.map((c) => o[c] ?? "")], "RAW");
  }
  async function agregar(tab, o) {
    const t = TAB[tab];
    await api().appendRow(`${t.hoja}!A1`, t.cols.map((c) => o[c] ?? ""), "RAW");
  }
  let tocado = false;
  async function tocar() {
    if (tocado || S.estado.actualizado === hoy()) return;
    tocado = true;
    try { const f = await filaDe("bitacora_estado", "actualizado"); await api().updateRange(`bitacora_estado!B${f}`, [[hoy()]], "RAW"); S.estado.actualizado = hoy(); } catch { tocado = false; }
  }

  /** Cambia la pantalla al tiro y escribe después, en fila. Si la escritura
   * falla, se recarga desde la planilla para no mostrar algo que no quedó. */
  let cola = Promise.resolve();
  function mutar(local, remoto, ok) {
    local();
    render();
    cola = cola.then(remoto).then(() => { if (ok) toast(ok); return tocar(); }).catch(async (e) => {
      console.error(e);
      toast("No se guardó. Recargando desde la planilla…");
      try { await load(); } catch { /* se muestra lo que había */ }
      render();
    });
  }

  // ---------- Cálculos ----------
  const hecha = (t) => t.estado === "hecha";
  const viva = (t) => t.estado !== "descartada";
  const porVence = (a, b) => ((isDate(a.vence) ? a.vence : "9999") < (isDate(b.vence) ? b.vence : "9999") ? -1 : 1);
  function calc() {
    const metas = S.metas.slice().sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    const tareas = S.tareas.filter(viva);
    const abiertas = tareas.filter((t) => !hecha(t));
    const cerradas = tareas.filter(hecha);
    return {
      metas, tareas, abiertas, cerradas,
      logradas: metas.filter((m) => isDate(m.lograda)),
      actual: metas.find((m) => !isDate(m.lograda)) || null,
      mias: abiertas.filter((t) => t.quien === "Daniel"),
      nomMeta: Object.fromEntries(metas.map((m) => [m.id, m.titulo])),
    };
  }

  // ---------- Piezas ----------
  function tareaHTML(t, c, editable) {
    const p = plazo(t.vence), d = hecha(t), abierta = editable && S.abierta === t.id;
    const chips = `<div class="chips"><span class="chip${t.quien === "Daniel" ? " you" : ""}">${esc(t.quien === "Daniel" ? "tú" : t.quien || "Claude")}</span>` +
      (d ? (isDate(t.hecha) ? `<span class="chip">cerrada ${esc(fmt(t.hecha))}</span>` : "") : (isDate(t.vence) ? `<span class="chip${p.late ? " late" : ""}">${esc(p.txt)}</span>` : "")) +
      (c.nomMeta[t.meta] ? `<span class="chip">${esc(c.nomMeta[t.meta])}</span>` : "") + "</div>";
    const cuerpo = `<div class="tt">${esc(t.titulo)}</div>${t.detalle ? `<div class="td">${esc(t.detalle)}</div>` : ""}${chips}`;
    return `<div class="task${d ? " done" : ""}"><div class="task-main">` +
      `<button type="button" class="check" data-a="tog" data-id="${esc(t.id)}" aria-label="${d ? "Reabrir" : "Marcar hecha"}: ${esc(t.titulo)}">✓</button>` +
      (editable ? `<button type="button" class="task-body" data-a="abrir" data-id="${esc(t.id)}" aria-expanded="${abierta}">${cuerpo}</button>` : `<div class="task-body">${cuerpo}</div>`) +
      `</div>${abierta ? editorHTML(t, c) : ""}</div>`;
  }
  function editorHTML(t, c) {
    return `<form class="editor" data-f="editar" data-id="${esc(t.id)}">` +
      `<label class="f">Título<input id="e-titulo" value="${esc(t.titulo)}" maxlength="160" required></label>` +
      `<label class="f">Detalle<textarea id="e-detalle" maxlength="400">${esc(t.detalle)}</textarea></label>` +
      `<div class="row"><label class="f">Quién<select id="e-quien"><option${t.quien === "Daniel" ? " selected" : ""}>Daniel</option><option${t.quien !== "Daniel" ? " selected" : ""}>Claude</option></select></label>` +
      `<label class="f">Fecha límite<input id="e-vence" type="date" value="${esc(t.vence)}"></label>` +
      `<label class="f">Meta<select id="e-meta"><option value="">Sin meta</option>${c.metas.map((m) => `<option value="${esc(m.id)}"${m.id === t.meta ? " selected" : ""}>${esc(m.titulo)}</option>`).join("")}</select></label></div>` +
      `<div class="actions"><button class="solid" type="submit">Guardar</button><button class="ghost danger" type="button" data-a="descartar" data-id="${esc(t.id)}">Descartar tarea</button></div></form>`;
  }

  // ---------- Vistas ----------
  function vHoy(c) {
    const d = new Date(), e = S.estado;
    const pct = c.metas.length ? Math.round((c.logradas.length / c.metas.length) * 100) : 0;
    const R = 54, C = 2 * Math.PI * R;
    const a = c.actual, pa = a ? plazo(a.objetivo) : null;
    const ta = a ? c.tareas.filter((t) => t.meta === a.id) : [], tad = ta.filter(hecha).length;
    const sig = c.mias.slice().sort(porVence)[0];
    const semana = c.cerradas.filter((t) => isDate(t.hecha) && dnum(hoy()) - dnum(t.hecha) < 7).length;
    const dias = isDate(e.inicio) ? dnum(hoy()) - dnum(e.inicio) : "–";
    const prox = c.abiertas.filter((t) => isDate(t.vence)).sort(porVence).slice(0, 4);
    const ult = S.registro.slice().sort((x, y) => (y.fecha + y.id < x.fecha + x.id ? -1 : 1)).slice(0, 3);
    return `<div><span class="eyebrow">${DIA[d.getDay()]} ${d.getDate()} de ${MESL[d.getMonth()]}</span><h1 class="h1">${esc(e.objetivo || "Danimart")}</h1><p class="lead">${esc(e.resumen || "")}</p></div>` +
      `<div class="card hero"><div class="ring"><svg viewBox="0 0 132 132"><circle class="bg" cx="66" cy="66" r="${R}"/><circle class="fg" id="ringfg" cx="66" cy="66" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${S.animar ? C : C * (1 - pct / 100)}" data-to="${C * (1 - pct / 100)}"/></svg><div class="num"><b>${pct}%</b><span>${c.logradas.length} de ${c.metas.length} metas</span></div></div>` +
      (a ? `<div><div class="k">Meta en curso</div><div class="t">${esc(a.titulo)}</div><div class="when${pa.late ? " late" : ""}">${pa.n == null ? "Sin fecha objetivo" : pa.late ? `Debía lograrse el ${esc(fmt(a.objetivo))}, van ${-pa.n} ${pa.n === -1 ? "día" : "días"} de atraso` : pa.n === 0 ? "El objetivo es hoy" : `Faltan ${pa.n} ${pa.n === 1 ? "día" : "días"} para el ${esc(fmt(a.objetivo))}`}</div>` +
        (ta.length ? `<div class="bar"><i data-w="${Math.round((tad / ta.length) * 100)}" style="width:${S.animar ? 0 : Math.round((tad / ta.length) * 100)}%"></i></div><div class="bar-cap">${tad} de ${ta.length} tareas de esta meta</div>` : "") + "</div>"
        : `<div><div class="k">Objetivo cumplido</div><div class="t">Todas las metas logradas</div></div>`) + "</div>" +
      (sig ? `<div class="next"><div class="txt"><div class="k">Te toca ahora${isDate(sig.vence) ? " · " + esc(plazo(sig.vence).txt) : ""}</div><div class="t">${esc(sig.titulo)}</div>${sig.detalle ? `<div class="d">${esc(sig.detalle)}</div>` : ""}</div><button type="button" data-a="tog" data-id="${esc(sig.id)}">Listo, hecho</button></div>`
        : `<div class="next free"><div class="txt"><div class="k">Te toca ahora</div><div class="t">Nada pendiente tuyo</div><div class="d">Mira las ideas o deja que Claude avance con lo suyo.</div></div></div>`) +
      `<div class="stats"><a class="stat" href="#tareas" data-filtro="Daniel"><b>${c.mias.length}</b><span>pendientes tuyos</span></a><a class="stat" href="#tareas" data-filtro="Claude"><b>${c.abiertas.length - c.mias.length}</b><span>pendientes de Claude</span></a><a class="stat" href="#diario"><b>${semana}</b><span>cerradas esta semana</span></a><div class="stat"><b>${dias}</b><span>días de proyecto</span></div></div>` +
      `<div class="sec"><div class="sec-head"><h2>Lo que viene</h2><a href="#tareas">Ver todas</a></div><div class="card soon">${prox.length ? prox.map((t) => { const p = plazo(t.vence); return `<div class="soon-row"><span class="date${p.late ? " late" : ""}">${esc(fmt(t.vence))}</span><b>${esc(t.titulo)}</b><span class="chip${t.quien === "Daniel" ? " you" : ""}">${t.quien === "Daniel" ? "tú" : esc(t.quien || "Claude")}</span></div>`; }).join("") : `<div class="empty">No hay tareas con fecha.</div>`}</div></div>` +
      `<div class="sec"><div class="sec-head"><h2>Últimos avances</h2><a href="#diario">Ver el diario</a></div><div class="log">${ult.map(entradaHTML).join("") || `<div class="empty">Todavía no hay registros.</div>`}</div></div>`;
  }

  function vRuta(c) {
    return `<div><span class="eyebrow">${c.logradas.length} de ${c.metas.length} logradas</span><h1 class="h1">La ruta</h1><p class="lead">Mini metas en orden hasta el objetivo. Toca una para ver sus tareas o mover su fecha.</p></div>` +
      `<div class="route">${c.metas.map((m, i) => {
        const ok = isDate(m.lograda), now = m === c.actual, p = plazo(m.objetivo), open = S.metaAbierta === m.id;
        const ts = c.tareas.filter((t) => t.meta === m.id).sort(porVence), td = ts.filter(hecha).length;
        return `<div class="stop ${ok ? "done" : now ? "now" : "pend"}${i === c.metas.length - 1 ? " goal" : ""}${open ? " open" : ""}"><div class="node">${ok ? "✓" : i + 1}</div><div class="stop-card">` +
          `<button type="button" class="stop-head" data-a="meta" data-id="${esc(m.id)}" aria-expanded="${open}"><span class="name">${esc(m.titulo)}</span>` +
          `<span class="when${!ok && p.late ? " late" : ""}">${ok ? "lograda el " + esc(fmt(m.lograda)) : (isDate(m.objetivo) ? "objetivo " : "") + esc(p.txt)}</span>` +
          (ts.length ? `<span class="stop-mini"><span class="bar"><i style="width:${Math.round((td / ts.length) * 100)}%"></i></span>${td} de ${ts.length} tareas</span>` : "") + "</button>" +
          (open ? `<div class="stop-body">${m.detalle ? `<p>${esc(m.detalle)}</p>` : ""}` +
            (ts.length ? `<div class="list flat">${ts.map((t) => tareaHTML(t, c, false)).join("")}</div>` : "") +
            `<div class="actions"><label class="f">Fecha objetivo<input type="date" data-c="objetivo" data-id="${esc(m.id)}" value="${esc(m.objetivo)}"></label>` +
            (ok ? `<button type="button" class="ghost" data-a="deslograr" data-id="${esc(m.id)}">Quitar marca de lograda</button>` : `<button type="button" class="solid" data-a="lograr" data-id="${esc(m.id)}">Marcar lograda</button>`) + "</div></div>" : "") +
          "</div></div>";
      }).join("") || `<div class="empty">No hay metas en la planilla.</div>`}</div>`;
  }

  function vTareas(c) {
    const cuenta = { Daniel: c.mias.length, Claude: c.abiertas.length - c.mias.length, Todos: c.abiertas.length, Hechas: c.cerradas.length };
    const nombres = { Daniel: "Tuyas", Claude: "De Claude", Todos: "Todas", Hechas: "Hechas" };
    const lista = S.filtro === "Hechas" ? c.cerradas.slice().sort((a, b) => (b.hecha < a.hecha ? -1 : 1))
      : (S.filtro === "Todos" ? c.abiertas : c.abiertas.filter((t) => (S.filtro === "Daniel" ? t.quien === "Daniel" : t.quien !== "Daniel"))).slice().sort(porVence);
    return `<div><span class="eyebrow">${c.abiertas.length} abiertas · ${c.cerradas.length} cerradas</span><h1 class="h1">Tareas</h1></div>` +
      `<form class="add" data-f="tarea"><input id="t-titulo" placeholder="Nueva tarea para ${S.filtro === "Claude" ? "Claude" : "ti"}" maxlength="160" required aria-label="Nueva tarea"><button class="solid" type="submit">Agregar</button></form>` +
      `<div class="filters">${Object.keys(nombres).map((k) => `<button type="button" data-a="filtro" data-id="${k}" aria-pressed="${S.filtro === k}">${nombres[k]}<span class="mono">${cuenta[k]}</span></button>`).join("")}</div>` +
      `<div class="list">${lista.map((t) => tareaHTML(t, c, true)).join("") || `<div class="empty">${S.filtro === "Hechas" ? "Todavía no hay tareas cerradas." : "Nada pendiente aquí."}</div>`}</div>`;
  }

  function vIdeas() {
    const ideas = S.ideas.filter((i) => i.estado !== "pasada" && i.estado !== "descartada");
    const areas = ["todas", ...new Set(ideas.map((i) => i.area).filter(Boolean))];
    if (!areas.includes(S.area)) S.area = "todas";
    const vis = S.area === "todas" ? ideas : ideas.filter((i) => i.area === S.area);
    return `<div><span class="eyebrow">${ideas.length} guardadas</span><h1 class="h1">Ideas</h1><p class="lead">Cosas que se pueden hacer más adelante. Cuando quieras partir con una, pásala a tareas.</p></div>` +
      `<form class="card sec" data-f="idea"><input id="i-titulo" placeholder="Idea nueva" maxlength="120" required aria-label="Idea nueva"><div class="add"><input id="i-detalle" placeholder="De qué se trata (opcional)" maxlength="300" aria-label="Detalle"><button class="solid" type="submit">Guardar</button></div></form>` +
      `<div class="filters">${areas.map((a) => `<button type="button" data-a="area" data-id="${esc(a)}" aria-pressed="${S.area === a}">${esc(a)}</button>`).join("")}</div>` +
      `<div class="ideas">${vis.map((i) => `<div class="idea"><b>${esc(i.titulo)}</b><p>${esc(i.detalle)}</p><div class="chips"><span class="chip">${esc(i.area || "idea")}${isDate(i.creada) ? " · " + esc(fmt(i.creada)) : ""}</span></div><div class="actions"><button type="button" class="ghost" data-a="pasar" data-id="${esc(i.id)}">Pasar a tareas</button><button type="button" class="ghost danger" data-a="nidea" data-id="${esc(i.id)}">Descartar</button></div></div>`).join("") || `<div class="empty">No hay ideas aquí todavía.</div>`}</div>`;
  }

  function entradaHTML(e) {
    return `<div class="entry"><span class="date">${esc(fmt(e.fecha))}</span><div>${e.tipo ? `<span class="kind">${esc(e.tipo)}</span>` : ""}<b>${esc(e.titulo)}</b>${e.texto ? `<p>${esc(e.texto)}</p>` : ""}</div></div>`;
  }
  function chartHTML(c) {
    const ds = c.cerradas.map((t) => t.hecha).filter(isDate).sort();
    if (!ds.length) return `<div class="empty">El gráfico aparece cuando haya tareas cerradas con fecha.</div>`;
    const ini = S.estado.inicio;
    const t0 = dnum(isDate(ini) && ini < ds[0] ? ini : ds[0]), t1 = Math.max(dnum(hoy()), dnum(ds[ds.length - 1])), span = Math.max(1, t1 - t0);
    const total = Math.max(c.tareas.length, ds.length), W = 640, H = 200, L = 34, Rm = 100, T = 16, B = 28;
    const x = (d) => L + ((d - t0) / span) * (W - L - Rm), y = (n) => H - B - (n / total) * (H - T - B);
    let path = `M${x(t0)} ${y(0)}`, n = 0;
    for (const d of ds) { const dx = x(dnum(d)); path += ` L${dx} ${y(n)}`; n++; path += ` L${dx} ${y(n)}`; }
    path += ` L${x(t1)} ${y(n)}`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tareas cerradas acumuladas: ${n} de ${total}">` +
      `<line x1="${L}" x2="${W - Rm}" y1="${y(total)}" y2="${y(total)}" stroke="var(--border)" stroke-dasharray="3 4"/><line x1="${L}" x2="${W - Rm}" y1="${y(0)}" y2="${y(0)}" stroke="var(--border)"/>` +
      `<path d="${path} L${x(t1)} ${y(0)} Z" fill="var(--accent-soft)" stroke="none"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/><circle cx="${x(t1)}" cy="${y(n)}" r="5" fill="var(--accent)"/>` +
      `<text x="${L - 6}" y="${y(total) + 4}" text-anchor="end">${total}</text><text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>` +
      `<text class="val" x="${x(t1) + 10}" y="${y(n) + 4}">${n} cerradas</text>${y(n) - y(total) > 16 ? `<text x="${W - Rm + 10}" y="${y(total) + 4}">${total} en total</text>` : ""}` +
      `<text x="${L}" y="${H - 8}">${esc(fmt(iso(t0)))}</text><text x="${W - Rm}" y="${H - 8}" text-anchor="end">hoy, ${esc(fmt(iso(t1)))}</text></svg>`;
  }
  function vDiario(c) {
    const log = S.registro.slice().sort((x, y) => (y.fecha + y.id < x.fecha + x.id ? -1 : 1));
    return `<div><span class="eyebrow">${log.length} registros</span><h1 class="h1">Diario</h1></div>` +
      `<div class="sec"><div class="sec-head"><h2>Progresión</h2><span>Tareas cerradas acumuladas</span></div><div class="card chart">${chartHTML(c)}</div></div>` +
      `<form class="card sec" data-f="nota"><div class="row"><label class="f">Tipo<select id="n-tipo"><option>hito</option><option>decisión</option><option>aprendizaje</option><option>nota</option></select></label><label class="f">Qué pasó<input id="n-titulo" maxlength="140" required></label></div><div class="add"><input id="n-texto" placeholder="Detalle (opcional)" maxlength="400" aria-label="Detalle"><button class="solid" type="submit">Anotar</button></div></form>` +
      `<div class="log">${log.map(entradaHTML).join("") || `<div class="empty">Todavía no hay registros.</div>`}</div>`;
  }

  function vMas() {
    const links = S.apoyo.slice().sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0)).filter((l) => /^https:\/\//.test(l.url));
    const cog = (yo, who, b, x) => `<div class="cog${yo ? " you" : ""}"><span class="who">${who}</span><b>${b}</b><span class="x">${x}</span></div>`;
    return `<div><span class="eyebrow">Material de apoyo</span><h1 class="h1">Cómo funciona la máquina</h1><p class="lead">Quién hace qué en cada venta. Lo marcado en amarillo es lo tuyo.</p></div>` +
      `<div class="machine">${cog(0, "Agente productos", "Elige qué vender", "Mide demanda, calcula margen y dice cuánto comprar.")}${cog(1, "Tú", "Compras y recibes", "Apruebas la compra, recibes la caja y revisas el stock.")}${cog(0, "Agente Mercado Libre", "Publica y atiende", "Ficha, precio, preguntas y cuidado de la reputación.")}${cog(1, "Tú", "Embalas y despachas", "Lo único físico. La meta es que sea lo único manual.")}${cog(0, "Agente tributario", "Deja listo el F29", "IVA, boletas y renta preparados para que solo confirmes.")}${cog(0, "Agente automatización", "Quita trabajo manual", "Convierte cada tarea repetida en un flujo que corre solo.")}${cog(0, "Hoja de Google", "Guarda los datos", "Productos, compras, ventas y decisiones, una fila por registro.")}${cog(1, "Tú", "Apruebas lo irreversible", "Firmar, pagar y declarar siempre pasan por ti.")}</div>` +
      `<div class="sec"><div class="sec-head"><h2>Accesos</h2></div><div class="links">${links.map((l) => `<a class="link" href="${esc(l.url)}" target="_blank" rel="noopener"><b>${esc(l.titulo)} ↗</b><span>${esc(l.nota)}</span></a>`).join("") || `<div class="empty">Sin accesos guardados.</div>`}</div>` +
      `<form class="card sec" data-f="link"><div class="row"><label class="f">Nombre<input id="l-titulo" maxlength="60" required></label><label class="f">Dirección (https)<input id="l-url" type="url" placeholder="https://" required></label></div><div class="add"><input id="l-nota" placeholder="Para qué sirve (opcional)" maxlength="140" aria-label="Nota"><button class="solid" type="submit">Agregar acceso</button></div></form></div>` +
      `<div class="foot"><span>${isDate(S.estado.actualizado) ? "Última actualización: " + esc(fmt(S.estado.actualizado)) : ""}</span><button type="button" class="ghost" data-a="salir">Cerrar sesión de Google</button></div>`;
  }

  function render() {
    if (!S.cargado) return;
    const c = calc();
    $("etapa").textContent = S.estado.etapa || "";
    const b = $("badge"); b.hidden = !c.mias.length; b.textContent = c.mias.length;
    document.querySelectorAll("#tabs a").forEach((a) => { const on = a.dataset.v === S.vista; a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    const v = { hoy: vHoy, ruta: vRuta, tareas: vTareas, ideas: vIdeas, diario: vDiario, mas: vMas }[S.vista];
    $("view").innerHTML = v(c);
    if (S.animar) {
      S.animar = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const r = $("ringfg"); if (r) r.setAttribute("stroke-dashoffset", r.dataset.to);
        document.querySelectorAll(".bar i[data-w]").forEach((i) => { i.style.width = i.dataset.w + "%"; });
      }));
    }
  }

  // ---------- Celebración ----------
  function confeti(cuanto) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = $("fx"), ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = ["#f2c200", "#f2c200", "#f3f3f1", "#9a9aa0", "#ffe27a"];
    const ps = Array.from({ length: cuanto }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.55, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 15 - 5, s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: col[(Math.random() * col.length) | 0] }));
    const t0 = performance.now(), turno = (confeti.turno = (confeti.turno || 0) + 1);
    (function paso(t) {
      const k = (t - t0) / 1600;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.restore();
      if (k >= 1 || turno !== confeti.turno) return;
      for (const p of ps) { p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = 1 - k * k; ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); ctx.restore(); }
      requestAnimationFrame(paso);
    })(t0);
  }

  // ---------- Acciones ----------
  const busca = (lista, id) => S[lista].find((x) => x.id === id);
  const ACC = {
    filtro(id) { S.filtro = id; S.abierta = null; try { localStorage.setItem("dm_filtro", id); } catch { /* da igual */ } render(); },
    area(id) { S.area = id; render(); },
    abrir(id) { S.abierta = S.abierta === id ? null : id; render(); },
    meta(id) { S.metaAbierta = S.metaAbierta === id ? null : id; render(); },
    tog(id) {
      const t = busca("tareas", id); if (!t) return;
      const cerrar = !hecha(t);
      mutar(() => { t.estado = cerrar ? "hecha" : "pendiente"; t.hecha = cerrar ? hoy() : ""; }, () => guardar("tareas", t), cerrar ? "Cerrada. Una menos" : "Reabierta");
      if (cerrar) {
        confeti(40);
        const resto = S.tareas.filter((x) => viva(x) && x.meta === t.meta && !hecha(x)).length;
        const m = busca("metas", t.meta);
        if (m && !resto && !isDate(m.lograda)) setTimeout(() => toast(`Todas las tareas de "${m.titulo}" listas. Márcala lograda en Ruta`), 3500);
      }
    },
    descartar(id) { const t = busca("tareas", id); if (!t) return; S.abierta = null; mutar(() => { t.estado = "descartada"; }, () => guardar("tareas", t), "Tarea descartada"); },
    lograr(id) { const m = busca("metas", id); if (!m) return; mutar(() => { m.lograda = hoy(); }, () => guardar("metas", m), "Meta lograda"); confeti(160); },
    deslograr(id) { const m = busca("metas", id); if (!m) return; mutar(() => { m.lograda = ""; }, () => guardar("metas", m), "Marca quitada"); },
    pasar(id) {
      const i = busca("ideas", id); if (!i) return;
      const t = { id: nuevoId("t"), titulo: i.titulo, detalle: i.detalle, quien: "Daniel", estado: "pendiente", creada: hoy(), vence: "", hecha: "", meta: "" };
      mutar(() => { i.estado = "pasada"; S.tareas.push(t); }, async () => { await agregar("tareas", t); await guardar("ideas", i); }, "Pasó a tus tareas");
    },
    nidea(id) { const i = busca("ideas", id); if (!i) return; mutar(() => { i.estado = "descartada"; }, () => guardar("ideas", i), "Idea descartada"); },
    salir() { window.SheetsAuth.logout(); location.reload(); },
  };
  const FORM = {
    tarea() {
      const titulo = $("t-titulo").value.trim(); if (!titulo) return;
      const t = { id: nuevoId("t"), titulo, detalle: "", quien: S.filtro === "Claude" ? "Claude" : "Daniel", estado: "pendiente", creada: hoy(), vence: "", hecha: "", meta: "" };
      if (S.filtro === "Hechas") S.filtro = "Daniel";
      S.abierta = t.id;
      mutar(() => { S.tareas.push(t); }, () => agregar("tareas", t), "Tarea agregada. Ponle fecha si quieres");
    },
    editar(id) {
      const t = busca("tareas", id); if (!t) return;
      const titulo = $("e-titulo").value.trim(); if (!titulo) return;
      const n = { titulo, detalle: $("e-detalle").value.trim(), quien: $("e-quien").value, vence: normFecha($("e-vence").value), meta: $("e-meta").value };
      S.abierta = null;
      mutar(() => Object.assign(t, n), () => guardar("tareas", t), "Guardada");
    },
    idea() {
      const titulo = $("i-titulo").value.trim(); if (!titulo) return;
      const i = { id: nuevoId("i"), titulo, detalle: $("i-detalle").value.trim(), area: S.area !== "todas" ? S.area : "idea", estado: "abierta", creada: hoy() };
      mutar(() => { S.ideas.push(i); }, () => agregar("ideas", i), "Idea guardada");
    },
    nota() {
      const titulo = $("n-titulo").value.trim(); if (!titulo) return;
      const e = { id: nuevoId("b"), fecha: hoy(), tipo: $("n-tipo").value, titulo, texto: $("n-texto").value.trim() };
      mutar(() => { S.registro.push(e); }, () => agregar("registro", e), "Anotado");
    },
    link() {
      const titulo = $("l-titulo").value.trim(), url = $("l-url").value.trim();
      if (!titulo || !/^https:\/\//.test(url)) { toast("La dirección tiene que partir con https://"); return; }
      const l = { id: nuevoId("a"), orden: String(S.apoyo.length + 1), titulo, nota: $("l-nota").value.trim(), url };
      mutar(() => { S.apoyo.push(l); }, () => agregar("apoyo", l), "Acceso agregado");
    },
  };

  document.addEventListener("click", (ev) => {
    const st = ev.target.closest("a.stat[data-filtro]");
    if (st) { S.filtro = st.dataset.filtro; return; }
    const b = ev.target.closest("[data-a]");
    if (b && ACC[b.dataset.a]) ACC[b.dataset.a](b.dataset.id);
  });
  document.addEventListener("submit", (ev) => {
    const f = ev.target.closest("[data-f]"); if (!f) return;
    ev.preventDefault();
    FORM[f.dataset.f](f.dataset.id);
  });
  document.addEventListener("change", (ev) => {
    const i = ev.target.closest('[data-c="objetivo"]'); if (!i) return;
    const m = busca("metas", i.dataset.id), v = normFecha(i.value);
    if (m && v) mutar(() => { m.objetivo = v; }, () => guardar("metas", m), "Fecha objetivo movida");
  });

  function ruta() {
    const h = location.hash.slice(1);
    const v = VISTAS.includes(h) ? h : "hoy";
    if (v !== S.vista) { S.vista = v; S.animar = true; S.abierta = null; window.scrollTo(0, 0); }
    render();
  }
  window.addEventListener("hashchange", ruta);

  async function refrescar(aviso) {
    const r = $("refresh"); r.classList.add("spin");
    try { await cola; await load(); S.animar = true; ruta(); if (aviso) toast("Datos al día"); }
    catch (e) { console.error(e); toast(/ 40[34]:/.test(String(e.message)) ? "Esta cuenta de Google no tiene acceso a la planilla" : "No se pudo leer la planilla. Revisa la conexión"); }
    finally { r.classList.remove("spin"); }
  }
  $("refresh").addEventListener("click", () => refrescar(true));
  document.addEventListener("visibilitychange", () => { const enUso = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if (!document.hidden && S.cargado && !enUso && !S.abierta && window.SheetsAuth.isLoggedIn()) refrescar(false); });

  async function entrar() {
    $("splash").hidden = true; $("app").hidden = false;
    S.vista = ""; // fuerza la primera animación
    await refrescar(false);
  }
  function init() {
    if (window.SheetsAuth.isLoggedIn()) { entrar(); return; }
    $("splash").hidden = false;
    $("loginBtn").addEventListener("click", async () => {
      const b = $("loginBtn"); b.disabled = true; b.textContent = "Conectando…";
      try { await window.SheetsAuth.getAccessToken(); await entrar(); }
      catch (e) { console.error(e); $("splashText").textContent = "No se pudo conectar. Intenta de nuevo."; }
      finally { b.disabled = false; b.textContent = "Conectar con Google"; }
    });
  }
  init();
})();
