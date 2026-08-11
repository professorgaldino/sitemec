import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, where, limit, writeBatch } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { firebaseConfig, USER_EMAIL_DOMAIN, driveUploadConfig } from "./firebase-config.js?v=20260811-16";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { user: null, profile: null, publicMode: false, registrationInProgress: false, materialModule: "all", materialDiscipline: "all", postModule: "all", postDiscipline: "all", data: { posts: [], exams: [], materials: [], minutes: [], jobs: [], partners: [], users: [] }, jobFilter: "all" };
const titles = { inicio: "Visão geral", recados: "Recados", provas: "Provas e avaliações", materiais: "Materiais", atas: "Atas pedagógicas", vagas: "Vagas de emprego", usuarios: "Professores", parceiros: "Empresas parceiras", "parceiros-publico": "Empresas parceiras" };
const modal = $("#formModal");

const CURRICULUM = [
  { module: "I", code: "I.1", name: "Desenho Técnico Mecânico" },
  { module: "I", code: "I.2", name: "Processos de Fabricação I" },
  { module: "I", code: "I.3", name: "Metrologia" },
  { module: "I", code: "I.4", name: "Tecnologia Mecânica" },
  { module: "I", code: "I.5", name: "Estudos de Matemática e Física Aplicados à Mecânica" },
  { module: "I", code: "I.6", name: "Elementos de Máquina" },
  { module: "I", code: "I.7", name: "Automação Industrial I" },
  { module: "I", code: "I.8", name: "Projetos de Tecnologia de Informação e Comunicação" },
  { module: "I", code: "I.9", name: "Segurança do Trabalho e Meio Ambiente" },
  { module: "II", code: "II.1", name: "Resistência dos Materiais e Ensaios Tecnológicos" },
  { module: "II", code: "II.2", name: "Eletricidade" },
  { module: "II", code: "II.3", name: "Desenho Auxiliado por Computador" },
  { module: "II", code: "II.4", name: "Automação Industrial II" },
  { module: "II", code: "II.5", name: "Processos de Fabricação II" },
  { module: "II", code: "II.6", name: "Inglês Instrumental" },
  { module: "II", code: "II.7", name: "Linguagem, Trabalho e Tecnologia" },
  { module: "II", code: "II.8", name: "Planejamento do Trabalho de Conclusão de Curso (TCC) em Mecânica" },
  { module: "III", code: "III.1", name: "Gestão Industrial e da Qualidade" },
  { module: "III", code: "III.2", name: "Automação Industrial III" },
  { module: "III", code: "III.3", name: "Tecnologia em CNC" },
  { module: "III", code: "III.4", name: "Processos de Fabricação III" },
  { module: "III", code: "III.5", name: "Conduta Profissional e Relações de Trabalho" },
  { module: "III", code: "III.6", name: "Tecnologia em Manutenção" },
  { module: "III", code: "III.7", name: "Tecnologia em Soldagem" },
  { module: "III", code: "III.8", name: "Desenvolvimento do Trabalho de Conclusão de Curso (TCC) em Mecânica" }
];
const disciplineOptions = CURRICULUM.map(d => ({ value: d.code, label: `${d.code} - ${d.name}` }));

function normalizeUsername(value = "") {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function userEmail(username) { return `${normalizeUsername(username)}@${USER_EMAIL_DOMAIN}`; }
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function formatDate(value, withTime = false) {
  const date = value?.toDate ? value.toDate() : value ? new Date(`${value}${String(value).length === 10 ? "T12:00:00" : ""}`) : null;
  if (!date || Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(date);
}
function initials(name = "MI") { return name.split(/\s+/).slice(0, 2).map(n => n[0]).join("").toUpperCase(); }
function toast(message, error = false) {
  const el = $("#toast"); el.textContent = message; el.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = "toast", 3500);
}
function isCoordinator() { return state.profile?.role === "coordinator"; }
function canEdit(item) { return isCoordinator() || item.authorId === state.user?.uid; }
function emptyOrHtml(el, html, emptyText) { el.classList.toggle("empty-state", !html); el.innerHTML = html || emptyText; }

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function setupCurriculumFilters() {
  const disciplineHtml = `<option value="all">Todas as disciplinas</option>${disciplineOptions.map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}`;
  ["postDisciplineFilter", "materialDisciplineFilter"].forEach(id => { const select = document.getElementById(id); if (select) select.innerHTML = disciplineHtml; });
  const bindings = [
    ["postModuleFilter", "postModule", renderPosts], ["postDisciplineFilter", "postDiscipline", renderPosts],
    ["materialModuleFilter", "materialModule", renderMaterials], ["materialDisciplineFilter", "materialDiscipline", renderMaterials]
  ];
  bindings.forEach(([id, key, render]) => document.getElementById(id)?.addEventListener("change", event => { state[key] = event.target.value; render(); }));
}
setupCurriculumFilters();

async function usernameExists(username) {
  const clean = normalizeUsername(username);
  if (clean.length < 3) return true;
  return (await getDoc(doc(db, "usernames", clean))).exists();
}

$("#registerName").addEventListener("input", e => {
  const user = normalizeUsername(e.target.value.split(/\s+/)[0]);
  if (!$("#registerUsername").dataset.edited) $("#registerUsername").value = user;
});
$("#registerUsername").addEventListener("input", async e => {
  e.target.dataset.edited = "true";
  const clean = normalizeUsername(e.target.value); e.target.value = clean;
  const status = $("#usernameStatus");
  if (clean.length < 3) { status.textContent = "mín. 3"; status.className = "input-status error"; return; }
  status.textContent = "verificando...";
  const used = await usernameExists(clean).catch(() => false);
  status.textContent = used ? "indisponível" : "disponível";
  status.className = `input-status ${used ? "error" : "ok"}`;
  $("#registerButton").disabled = used;
});
$$("[data-auth-view]").forEach(btn => btn.addEventListener("click", () => {
  $("#loginView").hidden = btn.dataset.authView !== "login";
  $("#registerView").hidden = btn.dataset.authView !== "register";
}));
$$("[data-toggle-password]").forEach(btn => btn.addEventListener("click", () => {
  const input = document.getElementById(btn.dataset.togglePassword);
  input.type = input.type === "password" ? "text" : "password"; btn.textContent = input.type === "password" ? "Ver" : "Ocultar";
}));

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const button = e.submitter; button.disabled = true; button.textContent = "Entrando...";
  const identifier = $("#loginUsername").value.trim().toLowerCase();
  const email = identifier.includes("@") ? identifier : userEmail(identifier);
  try { await signInWithEmailAndPassword(auth, email, $("#loginPassword").value); }
  catch { toast("Usuário ou senha inválidos.", true); }
  finally { button.disabled = false; button.textContent = "Entrar no portal"; }
});

$("#forgotPasswordButton").addEventListener("click", async () => {
  const email = prompt("Digite o e-mail válido cadastrado na sua conta:")?.trim().toLowerCase();
  if (!email) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Digite um e-mail válido.", true);
  try {
    await sendPasswordResetEmail(auth, email);
    toast("Enviamos as instruções para redefinir sua senha. Confira também o spam.");
  } catch (error) {
    console.error(error);
    toast("Não foi possível enviar a recuperação. Confira o e-mail informado.", true);
  }
});

async function enterPublicArea() {
  state.publicMode = true;
  state.profile = { name: "Aluno", role: "student" };
  setupPublicUI();
  $("#authScreen").hidden = true;
  $("#appScreen").hidden = false;
  goPage("inicio");
  await loadAll();
}

function showTeacherLogin() {
  state.publicMode = false;
  state.profile = null;
  $("#appScreen").hidden = true;
  $("#authScreen").hidden = false;
  $("#loginView").hidden = false;
  $("#registerView").hidden = true;
  setTimeout(() => $("#loginUsername").focus(), 50);
}

$("#studentAccessButton").addEventListener("click", enterPublicArea);
$("#teacherLoginButton").addEventListener("click", showTeacherLogin);

$("#registerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#registerName").value.trim(), username = normalizeUsername($("#registerUsername").value), email = $("#registerEmail").value.trim().toLowerCase(), password = $("#registerPassword").value, passwordConfirmation = $("#registerPasswordConfirmation").value;
  const button = e.submitter; button.disabled = true; button.textContent = "Criando...";
  let credential = null;
  try {
    if (password !== passwordConfirmation) throw new Error("As senhas não coincidem.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
    if (await usernameExists(username)) throw new Error("Este usuário não está disponível.");
    state.registrationInProgress = true;
    credential = await createUserWithEmailAndPassword(auth, email, password);
    const batch = writeBatch(db);
    batch.set(doc(db, "usernames", username), { uid: credential.user.uid, createdAt: serverTimestamp() });
    batch.set(doc(db, "users", credential.user.uid), { name, username, email, role: "teacher", active: true, mustChangePassword: false, createdAt: serverTimestamp() });
    await batch.commit();
    state.registrationInProgress = false;
    toast("Conta criada com sucesso!");
    await loadAuthenticatedUser(credential.user);
  } catch (err) {
    state.registrationInProgress = false;
    if (credential?.user) await deleteUser(credential.user).catch(() => {});
    toast(err.message.includes("password") ? "A senha precisa ter pelo menos 8 caracteres." : err.message, true);
  }
  finally { button.disabled = false; button.textContent = "Criar conta"; }
});

async function loadAuthenticatedUser(user) {
  state.user = user;
  if (!user) {
    if (!state.publicMode) await enterPublicArea();
    return;
  }
  state.publicMode = false;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) throw new Error("Perfil não encontrado.");
    state.profile = { id: snap.id, ...snap.data() };
    if (state.profile.active === false) { await signOut(auth); return toast("Este acesso está desativado.", true); }
    setupUserUI();
    $("#authScreen").hidden = true; $("#appScreen").hidden = false;
    if (state.profile.mustChangePassword) $("#passwordModal").showModal();
    await loadAll();
  } catch (err) { toast(err.message, true); await signOut(auth); }
}

onAuthStateChanged(auth, async user => {
  if (state.registrationInProgress) return;
  await loadAuthenticatedUser(user);
});

function setupUserUI() {
  const name = state.profile.name || state.profile.username;
  if ($("#welcomeName")) $("#welcomeName").textContent = name.split(" ")[0];
  $("#sidebarUserName").textContent = name;
  $("#sidebarUserRole").textContent = isCoordinator() ? "Coordenação" : "Professor";
  $("#userInitials").textContent = initials(name); $("#profileButton").textContent = initials(name);
  $("#logoutButton").hidden = false;
  $$(".coordinator-only").forEach(el => el.hidden = !isCoordinator());
  $$(".public-only").forEach(el => el.hidden = true);
  $$(".teacher-only").forEach(el => el.hidden = false);
  $$("[data-open-modal]").forEach(el => el.hidden = el.classList.contains("coordinator-only") && !isCoordinator());
  $("#welcomeMessage").textContent = isCoordinator() ? "Acompanhe tudo o que foi publicado e mantenha o curso conectado." : "Acompanhe as novidades do curso e mantenha a equipe atualizada.";
}

function setupPublicUI() {
  if ($("#welcomeName")) $("#welcomeName").textContent = "estudante";
  $("#welcomeMessage").textContent = "Seu ponto de acesso aos materiais, avaliações, avisos e oportunidades da Mecânica Industrial.";
  $("#sidebarUserName").textContent = "Área do aluno";
  $("#sidebarUserRole").textContent = "Acesso público";
  $("#logoutButton").hidden = true;
  $("#userInitials").textContent = "AL";
  $("#profileButton").textContent = "AL";
  $("#logoutButton").title = "Entrar como professor";
  $("#logoutButton").setAttribute("aria-label", "Entrar como professor");
  $$(".coordinator-only,.teacher-only").forEach(el => el.hidden = true);
  $$(".public-only").forEach(el => el.hidden = false);
  $$("[data-open-modal]").forEach(el => el.hidden = true);
}

$("#passwordForm").addEventListener("submit", async e => {
  e.preventDefault();
  const password = $("#newPassword").value, confirmation = $("#confirmPassword").value;
  if (password.length < 8) return toast("Use pelo menos 8 caracteres.", true);
  if (password !== confirmation) return toast("As senhas não coincidem.", true);
  try {
    await updatePassword(auth.currentUser, password);
    await updateDoc(doc(db, "users", auth.currentUser.uid), { mustChangePassword: false, passwordChangedAt: serverTimestamp() });
    state.profile.mustChangePassword = false; $("#passwordModal").close(); toast("Senha atualizada com sucesso.");
  } catch { toast("Não foi possível atualizar. Entre novamente e tente outra vez.", true); }
});

$("#logoutButton").addEventListener("click", async () => {
  if (state.publicMode) {
    showTeacherLogin();
    return;
  }
  await signOut(auth);
});
$("#menuButton").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$$(".nav-item").forEach(btn => btn.addEventListener("click", () => goPage(btn.dataset.page)));
$$("[data-go-page]").forEach(btn => btn.addEventListener("click", () => goPage(btn.dataset.goPage)));
function goPage(page) {
  $$(".page").forEach(el => el.classList.toggle("active", el.id === `page-${page}`));
  $$(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  $("#pageTitle").textContent = titles[page]; $("#sidebar").classList.remove("open"); window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadCollection(name, sort = "createdAt") {
  const snap = await getDocs(query(collection(db, name), orderBy(sort, "desc")));
  state.data[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function loadAll() {
  try {
    const loaders = [
      loadCollection("posts"), loadCollection("exams", "date"), loadCollection("materials"),
      loadCollection("jobs"), loadCollection("partners")
    ];
    if (!state.publicMode) loaders.push(loadCollection("minutes", "meetingDate"));
    else state.data.minutes = [];
    await Promise.all(loaders);
    if (isCoordinator()) {
      const users = await getDocs(collection(db, "users"));
      state.data.users = users.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    renderAll();
  } catch (err) { console.error(err); toast("Não foi possível carregar os dados. Confira as regras do Firebase.", true); }
}
function renderAll() { renderHome(); renderPosts(); renderExams(); renderMaterials(); renderMinutes(); renderJobs(); renderPartners(); if (isCoordinator()) renderUsers(); }
function renderHome() {
  const notices = state.data.posts.filter(p => p.type === "recado").slice(0, 4);
  const exams = state.data.exams.filter(e => new Date(`${e.date}T23:59`) >= new Date()).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 4);
  $("#statRecados").textContent = state.data.posts.filter(p => p.type === "recado").length;
  $("#statProvas").textContent = exams.length; $("#statMateriais").textContent = state.data.materials.length;
  $("#statVagas").textContent = state.data.jobs.filter(j => j.status === "disponivel").length;
  emptyOrHtml($("#homeNotices"), notices.map(p => `<article class="feed-item"><span class="feed-dot"></span><div><h4>${escapeHtml(p.title)}</h4><p>${escapeHtml(p.content).slice(0,110)}</p></div><time>${formatDate(p.createdAt)}</time></article>`).join(""), "Nenhum recado publicado.");
  emptyOrHtml($("#homeExams"), exams.map(e => { const d = new Date(`${e.date}T12:00`); return `<article class="timeline-item"><div class="timeline-date"><strong>${String(d.getDate()).padStart(2,"0")}</strong><small>${d.toLocaleDateString("pt-BR",{month:"short"})}</small></div><div><h4>${escapeHtml(e.subject)}</h4><p>${escapeHtml(e.className)} · ${escapeHtml(e.time || "Horário a definir")}</p></div></article>`; }).join(""), "Nenhuma prova agendada.");
  emptyOrHtml($("#homePartners"), state.data.partners.map(p => {
    const logo = driveImageUrl(p.logoUrl, p.driveFileId);
    return logo ? `<img class="partner-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(p.name)}" title="${escapeHtml(p.name)}" loading="lazy">` : `<strong>${escapeHtml(p.name)}</strong>`;
  }).join(""), "Os parceiros aparecerão aqui.");
  renderLatestUpdates();
}

function itemTime(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  const parsed = value ? new Date(`${value}${String(value).length === 10 ? "T12:00:00" : ""}`).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function renderLatestUpdates() {
  const updates = [
    ...state.data.posts.filter(p => p.type === "recado").map(p => ({ type: "Recado", kind: "", page: "recados", title: p.title, description: p.content, date: p.createdAt })),
    ...state.data.materials.map(m => ({ type: "Material", kind: "material", page: "materiais", title: m.title, description: m.description || m.fileName, date: m.createdAt })),
    ...state.data.jobs.map(j => ({ type: "Vaga", kind: "job", page: "vagas", title: j.title || "Nova oportunidade", description: j.content || j.description || j.company || "Confira a vaga publicada.", date: j.createdAt })),
    ...state.data.exams.map(e => ({ type: "Prova", kind: "exam", page: "provas", title: e.subject, description: `${e.className} · ${formatDate(e.date)}`, date: e.createdAt || e.date }))
  ].sort((a, b) => itemTime(b.date) - itemTime(a.date)).slice(0, 3);
  const html = updates.map(update => `<article class="latest-card" data-latest-page="${update.page}" tabindex="0" role="button" aria-label="Abrir ${escapeHtml(update.type)}: ${escapeHtml(update.title)}"><div class="latest-card-top"><span class="update-type ${update.kind}">${escapeHtml(update.type)}</span><time>${formatDate(update.date)}</time></div><h3>${escapeHtml(update.title)}</h3><p>${escapeHtml(update.description || "").slice(0, 115)}</p><span class="update-link">Consultar atualização →</span></article>`).join("");
  emptyOrHtml($("#latestUpdates"), html, "Ainda não há atualizações publicadas.");
}
function actionButtons(item, collectionName) {
  if (!canEdit(item)) return "";
  return `<button class="btn btn-danger btn-small" data-delete="${collectionName}" data-id="${item.id}" data-drive-file="${item.driveFileId || ""}">Excluir</button>`;
}
function curriculumInfo(item) {
  const discipline = CURRICULUM.find(d => d.code === item.disciplineCode);
  return discipline || { module: item.module || "Geral", code: item.disciplineCode || "", name: item.disciplineName || item.discipline || "Geral do curso" };
}
function curriculumMatches(item, moduleFilter, disciplineFilter) {
  const info = curriculumInfo(item);
  return (moduleFilter === "all" || info.module === moduleFilter)
    && (disciplineFilter === "all" || info.code === disciplineFilter);
}
function groupByModule(items, cardRenderer) {
  const groups = ["I", "II", "III", "Geral"].map(module => ({ module, items: items.filter(item => curriculumInfo(item).module === module) })).filter(group => group.items.length);
  return groups.map(group => `<section class="curriculum-group"><div class="curriculum-group-heading"><span>${group.module === "Geral" ? "Geral do curso" : `Módulo ${group.module}`}</span><strong>${group.items.length} ${group.items.length === 1 ? "publicação" : "publicações"}</strong></div><div class="cards-grid">${group.items.map(cardRenderer).join("")}</div></section>`).join("");
}
function renderPosts() {
  const posts = state.data.posts.filter(p => p.type === "recado" && curriculumMatches(p, state.postModule, state.postDiscipline));
  const html = groupByModule(posts, p => { const d = curriculumInfo(p); return `<article class="content-card"><div class="card-badges"><span class="badge">${p.authorRole === "coordinator" ? "Coordenação" : "Professor"}</span><span class="badge gray">${escapeHtml(d.code ? `${d.code} - ${d.name}` : d.name)}</span></div><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.content)}</p><div class="card-actions"><div class="card-meta"><span>Por ${escapeHtml(p.authorName)}</span><span>Publicado em ${formatDate(p.createdAt, true)}</span>${p.noticeDate ? `<span>Data do recado: ${formatDate(p.noticeDate)}</span>` : ""}</div>${actionButtons(p,"posts")}</div></article>`; });
  emptyOrHtml($("#recadosList"), html, "Nenhum recado encontrado para os filtros selecionados.");
}
function renderExams() {
  emptyOrHtml($("#examsList"), state.data.exams.map(e => `<article class="content-card"><span class="badge amber">${formatDate(e.date)}</span><h3>${escapeHtml(e.subject)}</h3><p>${escapeHtml(e.description || "Avaliação programada.")}</p><div class="card-meta"><span>Turma: ${escapeHtml(e.className)}</span><span>Horário: ${escapeHtml(e.time || "A definir")}</span><span>Professor: ${escapeHtml(e.authorName)}</span></div><div class="card-actions"><small>Postado em ${formatDate(e.createdAt)}</small>${actionButtons(e,"exams")}</div></article>`).join(""), "Nenhuma prova agendada.");
}
function materialPreview(material) {
  const url = String(material.fileUrl || "").trim();
  if (!url) return `<div class="material-preview preview-empty"><span>Sem prévia</span></div>`;
  const safeUrl = escapeHtml(url);
  const extension = String(material.extension || "").toLowerCase();
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) return `<div class="material-preview"><iframe src="https://drive.google.com/file/d/${escapeHtml(driveMatch[1])}/preview" title="Prévia de ${escapeHtml(material.title)}" loading="lazy" allow="autoplay"></iframe></div>`;
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return `<div class="material-preview"><img src="${safeUrl}" alt="Prévia de ${escapeHtml(material.title)}" loading="lazy"></div>`;
  if (extension === "pdf" || /\.pdf(\?|$)/i.test(url)) return `<div class="material-preview"><iframe src="${safeUrl}" title="Prévia de ${escapeHtml(material.title)}" loading="lazy"></iframe></div>`;
  if (["ppt", "pptx", "doc", "docx"].includes(extension)) return `<div class="material-preview"><iframe src="https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}" title="Prévia de ${escapeHtml(material.title)}" loading="lazy"></iframe></div>`;
  let domain = "Link externo";
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  return `<a class="material-preview link-preview" href="${safeUrl}" target="_blank" rel="noopener"><span class="link-preview-icon">↗</span><strong>${escapeHtml(domain)}</strong><small>Clique para visualizar o conteúdo</small></a>`;
}

function driveImageUrl(url, knownFileId = "") {
  if (knownFileId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(knownFileId)}&sz=w1200`;
  const value = String(url || "");
  const pathMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  const queryMatch = value.match(/[?&]id=([^&#]+)/i);
  const fileId = pathMatch?.[1] || queryMatch?.[1] || "";
  return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200` : value;
}
function renderMaterials() {
  const materials = state.data.materials.filter(m => curriculumMatches(m, state.materialModule, state.materialDiscipline));
  const html = groupByModule(materials, m => { const d = curriculumInfo(m); return `<article class="content-card file-card">${materialPreview(m)}<div class="card-badges"><span class="badge">${escapeHtml(m.category || "Material")}</span><span class="badge gray">${escapeHtml(d.code ? `${d.code} - ${d.name}` : d.name)}</span></div><h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.description || m.fileName || "Material complementar")}</p><div class="card-meta"><span>Professor: ${escapeHtml(m.authorName)}</span><span>${formatDate(m.createdAt)}</span></div><div class="card-actions"><a class="btn btn-secondary btn-small" href="${escapeHtml(m.fileUrl)}" target="_blank" rel="noopener">Abrir material</a>${actionButtons(m,"materials")}</div></article>`; });
  emptyOrHtml($("#materialsList"), html, "Nenhum material encontrado para os filtros selecionados.");
}
function renderMinutes() {
  emptyOrHtml($("#minutesList"), state.data.minutes.map(m => `<article class="content-card"><span class="badge gray">Reunião · ${formatDate(m.meetingDate)}</span><h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.summary || "Ata pedagógica")}</p><div class="card-actions"><div class="card-meta"><span>Registrada por ${escapeHtml(m.authorName)}</span></div><div>${m.fileUrl ? `<a class="btn btn-secondary btn-small" href="${m.fileUrl}" target="_blank" rel="noopener">Abrir ata</a>` : ""} ${actionButtons(m,"minutes")}</div></div></article>`).join(""), "Nenhuma ata cadastrada.");
}
function renderJobs() {
  const jobs = state.data.jobs.filter(j => state.jobFilter === "all" || j.status === state.jobFilter);
  emptyOrHtml($("#jobsList"), jobs.map(j => {
    const text = j.content || j.description || "";
    const title = j.title || text.split(/\r?\n/).find(line => line.trim())?.trim().slice(0, 90) || "Vaga de emprego";
    const legacyMeta = [j.company, j.location].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join("");
    const imageUrl = driveImageUrl(j.fileUrl, j.driveFileId);
    return `<article class="content-card job-card">${imageUrl ? `<a class="job-image-link" href="${escapeHtml(j.fileUrl || imageUrl)}" target="_blank" rel="noopener"><img class="job-image" src="${escapeHtml(imageUrl)}" alt="Imagem da vaga ${escapeHtml(title)}" loading="lazy"></a>` : ""}<div class="job-card-body"><span class="badge ${j.status === "disponivel" ? "green" : "gray"}">${j.status === "disponivel" ? "Disponível" : "Preenchida"}</span><h3>${escapeHtml(title)}</h3>${text ? `<p>${escapeHtml(text)}</p>` : ""}<div class="card-meta">${legacyMeta}<span>Publicado por ${escapeHtml(j.authorName || "Professor")}</span></div><div class="card-actions">${j.contact ? `<a class="link-button" href="mailto:${escapeHtml(j.contact)}">Entrar em contato</a>` : "<span></span>"}<div>${canEdit(j) ? `<button class="btn btn-secondary btn-small" data-job-status="${j.id}" data-status="${j.status === "disponivel" ? "preenchida" : "disponivel"}">${j.status === "disponivel" ? "Marcar preenchida" : "Reabrir vaga"}</button> ${actionButtons(j,"jobs")}` : ""}</div></div></div></article>`;
  }).join(""), "Nenhuma vaga encontrada.");
}
function renderPartners() {
  const cards = state.data.partners.map(p => {
    const logo = driveImageUrl(p.logoUrl, p.driveFileId);
    return `<article class="content-card partner-card">${logo ? `<img src="${escapeHtml(logo)}" alt="Logo ${escapeHtml(p.name)}" loading="lazy">` : `<div class="logo-placeholder">${initials(p.name)}</div>`}<h3>${escapeHtml(p.name)}</h3><div class="card-actions"><small>Empresa parceira</small>${actionButtons(p,"partners")}</div></article>`;
  }).join("");
  emptyOrHtml($("#partnersList"), cards, "Nenhuma empresa parceira.");
  emptyOrHtml($("#publicPartnersList"), cards, "Nenhuma empresa parceira.");
}
function renderUsers() {
  const rows = state.data.users.map(u => `<tr><td><div class="table-user"><span class="avatar">${initials(u.name)}</span><div><strong>${escapeHtml(u.name)}</strong><br><small>${escapeHtml(u.username)}</small></div></div></td><td><span class="badge ${u.role === "coordinator" ? "" : "gray"}">${u.role === "coordinator" ? "Coordenação" : "Professor"}</span></td><td>${u.active === false ? "Desativado" : "Ativo"}</td><td>${u.mustChangePassword ? "Senha provisória" : "Definida"}</td></tr>`).join("");
  emptyOrHtml($("#usersList"), rows ? `<table class="data-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Senha</th></tr></thead><tbody>${rows}</tbody></table>` : "", "Nenhum professor cadastrado.");
}

const forms = {
  post: { title: "Novo recado", kicker: "Comunicação", collection: "posts", fields: [
    ["title","Título","text",true],["disciplineCode","Disciplina","select",true,[{ value: "general", label: "Geral do curso" }, ...disciplineOptions]],["noticeDate","Data do recado","date",true],["content","Mensagem","textarea",true]
  ], extra: { type: "recado" } },
  exam: { title: "Marcar prova", kicker: "Calendário", collection: "exams", fields: [
    ["subject","Disciplina / avaliação","text",true],["className","Turma","text",true],["date","Data da prova","date",true],["time","Horário","time",false],["description","Orientações","textarea",false]
  ] },
  material: { title: "Enviar material", kicker: "Biblioteca", collection: "materials", file: true, fields: [
    ["title","Título do material","text",true],["disciplineCode","Disciplina","select",true,disciplineOptions],["category","Tipo de material","select",true,["Aula","Exercícios","Apostila","Apresentação","Referência","Link"]],["description","Descrição","textarea",false],["materialLink","Link do material (opcional)","url",false],["file","Arquivo (PDF, Word, PowerPoint ou imagem)","file",false]
  ] },
  minute: { title: "Nova ata pedagógica", kicker: "Documentação", collection: "minutes", file: true, coordinator: true, fields: [
    ["title","Título da reunião","text",true],["meetingDate","Data da reunião","date",true],["summary","Resumo / decisões","textarea",true],["file","Arquivo da ata (opcional)","file",false]
  ] },
  job: { title: "Publicar vaga", kicker: "Oportunidade", collection: "jobs", file: true, fields: [
    ["content","Texto completo da vaga (opcional se enviar uma imagem)","textarea",false],["file","Imagem da vaga (opcional se preencher o texto)","file",false],["status","Status","select",true,["disponivel","preenchida"]]
  ] },
  partner: { title: "Nova empresa parceira", kicker: "Relacionamento", collection: "partners", file: true, coordinator: true, fields: [
    ["name","Nome da empresa","text",true],["file","Logo da empresa","file",true]
  ] },
  user: { title: "Novo professor", kicker: "Administração", special: "user", coordinator: true, fields: [
    ["name","Nome completo","text",true],["username","Nome de usuário","text",true],["temporaryPassword","Senha provisória","text",true]
  ] }
};

$$("[data-open-modal]").forEach(btn => btn.addEventListener("click", () => openModal(btn.dataset.openModal)));
$("#quickPostButton").addEventListener("click", () => openModal("post"));
$$("[data-close-form-modal]").forEach(btn => btn.addEventListener("click", () => {
  if (modal.dataset.uploading === "true") return;
  $("#dynamicForm").reset();
  modal.close();
}));
function openModal(type) {
  const config = forms[type]; if (!config || (config.coordinator && !isCoordinator())) return;
  modal.dataset.type = type; $("#modalTitle").textContent = config.title; $("#modalKicker").textContent = config.kicker;
  $("#modalFields").innerHTML = config.fields.map(([name,label,type,required,options]) => {
    const req = required ? "required" : "";
    if (type === "textarea") return `<label>${label}<textarea name="${name}" ${req}></textarea></label>`;
    if (type === "select") return `<label>${label}<select name="${name}" ${req}>${options.map(option => { const value = typeof option === "object" ? option.value : option; const text = typeof option === "object" ? option.label : option[0].toUpperCase() + option.slice(1); return `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`; }).join("")}</select></label>`;
    const accept = name === "file" ? (modal.dataset.type === "job" ? 'accept="image/*"' : 'accept=".pdf,.doc,.docx,.ppt,.pptx,image/*"') : "";
    return `<label>${label}<input name="${name}" type="${type}" ${req} ${accept}></label>`;
  }).join("");
  if (type === "user") $('[name="temporaryPassword"]', modal).value = generatePassword();
  modal.showModal();
}
$("#dynamicForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (e.submitter?.value === "cancel") return modal.close();
  const form = e.currentTarget;
  const formData = new FormData(form);
  const config = forms[modal.dataset.type], data = Object.fromEntries(formData);
  const button = $("#modalSubmit");
  const closeButtons = $$("[data-close-form-modal]", modal);
  button.disabled = true; button.textContent = "Salvando...";
  closeButtons.forEach(item => item.disabled = true);
  modal.dataset.uploading = "true";
  try {
    if (config.special === "user") throw new Error("No plano gratuito, o professor deve criar a própria conta na tela inicial.");
    if (config.collection === "materials" && !formData.get("file")?.size && !String(data.materialLink || "").trim()) throw new Error("Envie um arquivo ou informe o link do material.");
    if (config.collection === "jobs") {
      const jobFile = formData.get("file");
      if (!String(data.content || "").trim() && !jobFile?.size) throw new Error("Escreva o texto da vaga ou envie uma imagem.");
      if (jobFile?.size && !["jpg","jpeg","png","webp"].includes(jobFile.name.split(".").pop().toLowerCase())) throw new Error("A imagem da vaga deve ser JPG, PNG ou WEBP.");
    }
    await saveRecord(config, data, formData.get("file"));
    modal.close(); form.reset(); toast("Salvo com sucesso."); await loadAll();
  } catch (err) { console.error(err); toast(err.message || "Não foi possível salvar.", true); }
  finally {
    button.disabled = false; button.textContent = "Salvar";
    closeButtons.forEach(item => item.disabled = false);
    delete modal.dataset.uploading;
    $("#uploadFeedback")?.remove();
  }
});

async function saveRecord(config, data, file) {
  delete data.file;
  const materialLink = String(data.materialLink || "").trim();
  delete data.materialLink;
  if (materialLink) {
    let parsedLink;
    try { parsedLink = new URL(materialLink); } catch { throw new Error("Informe um link válido, começando com https://"); }
    if (!["http:", "https:"].includes(parsedLink.protocol)) throw new Error("O link precisa começar com http:// ou https://");
  }
  if (data.disciplineCode) {
    const discipline = CURRICULUM.find(item => item.code === data.disciplineCode);
    if (discipline) {
      data.disciplineName = discipline.name;
      data.module = discipline.module;
    } else if (data.disciplineCode === "general") {
      data.disciplineName = "Geral do curso";
      data.module = "Geral";
    }
  }
  Object.assign(data, config.extra || {}, { authorId: state.user.uid, authorName: state.profile.name, authorRole: state.profile.role, createdAt: serverTimestamp() });
  if (file?.size) {
    const uploaded = await uploadFileToDrive(file, config.collection);
    if (config.collection === "partners") {
      data.logoUrl = uploaded.url;
    } else {
      data.fileUrl = uploaded.url;
    }
    data.driveFileId = uploaded.fileId;
    data.fileName = file.name; data.extension = file.name.split(".").pop();
  } else if (config.collection === "materials" && materialLink) {
    data.fileUrl = materialLink;
    data.fileName = materialLink;
    try { data.extension = new URL(materialLink).pathname.split(".").pop().toLowerCase().slice(0, 8); } catch { data.extension = "link"; }
  }
  await withTimeout(
    addDoc(collection(db, config.collection), data),
    20000,
    "O Firebase não respondeu em 20 segundos. Verifique sua internet e as regras do Firestore. Antes de tentar novamente, confira se o registro já apareceu na lista."
  );
}

function fileToBase64(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onprogress = event => event.lengthComputable && onProgress?.(Math.round(event.loaded / event.total * 45));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

async function uploadFileToDrive(file, category) {
  if (!driveUploadConfig.webAppUrl.startsWith("https://script.google.com/")) throw new Error("O envio ao Google Drive ainda não foi configurado.");
  if (driveUploadConfig.maxFileSizeMb) {
    const maxBytes = driveUploadConfig.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) throw new Error(`O arquivo deve ter no máximo ${driveUploadConfig.maxFileSizeMb} MB.`);
  }
  const extension = file.name.split(".").pop().toLowerCase();
  const mimeByExtension = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const mimeType = mimeByExtension[extension] || file.type || "";
  if (!mimeByExtension[extension]) throw new Error("Formato não permitido. Envie PDF, Word, PowerPoint, JPG, PNG ou WEBP.");

  const feedback = document.createElement("section");
  feedback.id = "uploadFeedback";
  feedback.className = "upload-feedback";
  feedback.setAttribute("aria-live", "polite");
  feedback.innerHTML = `<div class="upload-feedback-heading"><span class="upload-spinner"></span><div><strong id="uploadStatusTitle">Preparando o arquivo…</strong><small id="uploadStatusDetail">${escapeHtml(file.name)} · ${(file.size / 1024 / 1024).toFixed(2).replace(".", ",")} MB</small></div></div><div class="progress"><span></span></div><p>Não feche esta janela enquanto o material estiver sendo enviado.</p>`;
  $("#modalFields").append(feedback);
  const bar = $(".progress", feedback);
  const barFill = $(".progress span", feedback);
  const title = $("#uploadStatusTitle", feedback);
  const detail = $("#uploadStatusDetail", feedback);
  const setProgress = value => barFill.style.width = `${value}%`;

  const base64 = await fileToBase64(file, value => {
    setProgress(value);
    title.textContent = "Lendo o arquivo no computador…";
  });
  setProgress(48);
  title.textContent = "Enviando ao Google Drive…";
  detail.textContent = "Aguarde, arquivos maiores levam um pouco mais de tempo.";
  bar.classList.add("indeterminate");

  const startedAt = Date.now();
  const elapsedTimer = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    detail.textContent = `Envio em andamento há ${seconds} segundo${seconds === 1 ? "" : "s"}. O portal continua funcionando.`;
  }, 1000);

  try {
    const result = await postToDrive({
      action: "upload", fileName: file.name, mimeType, category,
      authorName: state.profile.name, fileData: base64
    }, 300000);
    bar.classList.remove("indeterminate");
    setProgress(100);
    title.textContent = "Arquivo recebido pelo Drive!";
    detail.textContent = "Finalizando a publicação do material…";
    return result;
  } finally {
    clearInterval(elapsedTimer);
  }
}

function postToDrive(values, timeoutMs = 30000) {
  const requestId = `drive-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe"); iframe.name = requestId; iframe.hidden = true;
    const form = document.createElement("form"); form.method = "POST"; form.action = driveUploadConfig.webAppUrl; form.target = requestId; form.hidden = true;
    Object.entries({ requestId, token: driveUploadConfig.uploadToken, ...values }).forEach(([name, value]) => {
      const input = name === "fileData" ? document.createElement("textarea") : document.createElement("input");
      input.name = name; input.value = value; form.append(input);
    });
    const cleanup = () => { window.removeEventListener("message", receive); form.remove(); iframe.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("O envio demorou demais. Tente novamente.")); }, timeoutMs);
    const receive = event => {
      if (event.data?.source !== "sitemec-drive" || event.data?.requestId !== requestId) return;
      clearTimeout(timer); cleanup();
      event.data.ok ? resolve(event.data) : reject(new Error(event.data.error || "Falha no Google Drive."));
    };
    window.addEventListener("message", receive); document.body.append(iframe, form); form.submit();
  });
}

document.addEventListener("click", async e => {
  const latest = e.target.closest("[data-latest-page]");
  if (latest) goPage(latest.dataset.latestPage);
  const del = e.target.closest("[data-delete]");
  if (del) {
    if (!confirm("Deseja excluir este registro?")) return;
    try {
      if (del.dataset.driveFile) await postToDrive({ action: "delete", fileId: del.dataset.driveFile }).catch(() => {});
      await deleteDoc(doc(db, del.dataset.delete, del.dataset.id)); toast("Registro excluído."); await loadAll();
    } catch { toast("Não foi possível excluir.", true); }
  }
  const status = e.target.closest("[data-job-status]");
  if (status) { await updateDoc(doc(db,"jobs",status.dataset.jobStatus),{status:status.dataset.status,updatedAt:serverTimestamp()}); await loadAll(); }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-latest-page]")) {
    e.preventDefault(); goPage(e.target.dataset.latestPage);
  }
});
$$("[data-job-filter]").forEach(btn => btn.addEventListener("click", () => { state.jobFilter = btn.dataset.jobFilter; $$("[data-job-filter]").forEach(b => b.classList.toggle("active",b===btn)); renderJobs(); }));
