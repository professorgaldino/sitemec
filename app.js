import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, where, limit } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { firebaseConfig, USER_EMAIL_DOMAIN, driveUploadConfig } from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { user: null, profile: null, publicMode: false, data: { posts: [], exams: [], materials: [], minutes: [], jobs: [], partners: [], users: [] }, jobFilter: "all" };
const titles = { inicio: "Visão geral", recados: "Recados", provas: "Provas e avaliações", materiais: "Materiais", atas: "Atas pedagógicas", vagas: "Vagas de emprego", usuarios: "Professores", parceiros: "Empresas parceiras", "parceiros-publico": "Empresas parceiras" };
const modal = $("#formModal");

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
  try { await signInWithEmailAndPassword(auth, userEmail($("#loginUsername").value), $("#loginPassword").value); }
  catch { toast("Usuário ou senha inválidos.", true); }
  finally { button.disabled = false; button.textContent = "Entrar no portal"; }
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
  const name = $("#registerName").value.trim(), username = normalizeUsername($("#registerUsername").value), password = $("#registerPassword").value;
  const button = e.submitter; button.disabled = true; button.textContent = "Criando...";
  try {
    if (await usernameExists(username)) throw new Error("Este usuário não está disponível.");
    const credential = await createUserWithEmailAndPassword(auth, userEmail(username), password);
    await setDoc(doc(db, "usernames", username), { uid: credential.user.uid, createdAt: serverTimestamp() });
    await setDoc(doc(db, "users", credential.user.uid), { name, username, role: "teacher", active: true, mustChangePassword: false, createdAt: serverTimestamp() });
    toast("Conta criada com sucesso!");
  } catch (err) { toast(err.message.includes("password") ? "A senha precisa ter pelo menos 8 caracteres." : err.message, true); }
  finally { button.disabled = false; button.textContent = "Criar conta"; }
});

onAuthStateChanged(auth, async user => {
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
});

function setupUserUI() {
  const name = state.profile.name || state.profile.username;
  if ($("#welcomeName")) $("#welcomeName").textContent = name.split(" ")[0];
  $("#sidebarUserName").textContent = name;
  $("#sidebarUserRole").textContent = isCoordinator() ? "Coordenação" : "Professor";
  $("#userInitials").textContent = initials(name); $("#profileButton").textContent = initials(name);
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
  emptyOrHtml($("#homePartners"), state.data.partners.map(p => p.logoUrl ? `<img class="partner-logo" src="${p.logoUrl}" alt="${escapeHtml(p.name)}" title="${escapeHtml(p.name)}">` : `<strong>${escapeHtml(p.name)}</strong>`).join(""), "Os parceiros aparecerão aqui.");
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
    ...state.data.jobs.map(j => ({ type: "Vaga", kind: "job", page: "vagas", title: j.title, description: `${j.company} · ${j.location || "Local a combinar"}`, date: j.createdAt })),
    ...state.data.exams.map(e => ({ type: "Prova", kind: "exam", page: "provas", title: e.subject, description: `${e.className} · ${formatDate(e.date)}`, date: e.createdAt || e.date }))
  ].sort((a, b) => itemTime(b.date) - itemTime(a.date)).slice(0, 3);
  const html = updates.map(update => `<article class="latest-card" data-latest-page="${update.page}" tabindex="0" role="button" aria-label="Abrir ${escapeHtml(update.type)}: ${escapeHtml(update.title)}"><div class="latest-card-top"><span class="update-type ${update.kind}">${escapeHtml(update.type)}</span><time>${formatDate(update.date)}</time></div><h3>${escapeHtml(update.title)}</h3><p>${escapeHtml(update.description || "").slice(0, 115)}</p><span class="update-link">Consultar atualização →</span></article>`).join("");
  emptyOrHtml($("#latestUpdates"), html, "Ainda não há atualizações publicadas.");
}
function actionButtons(item, collectionName) {
  if (!canEdit(item)) return "";
  return `<button class="btn btn-danger btn-small" data-delete="${collectionName}" data-id="${item.id}" data-drive-file="${item.driveFileId || ""}">Excluir</button>`;
}
function renderPosts() {
  const posts = state.data.posts.filter(p => p.type === "recado");
  emptyOrHtml($("#recadosList"), posts.map(p => `<article class="content-card"><span class="badge">${p.authorRole === "coordinator" ? "Coordenação" : "Professor"}</span><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.content)}</p><div class="card-actions"><div class="card-meta"><span>Por ${escapeHtml(p.authorName)}</span><span>Publicado em ${formatDate(p.createdAt, true)}</span>${p.noticeDate ? `<span>Data do recado: ${formatDate(p.noticeDate)}</span>` : ""}</div>${actionButtons(p,"posts")}</div></article>`).join(""), "Nenhum recado publicado.");
}
function renderExams() {
  emptyOrHtml($("#examsList"), state.data.exams.map(e => `<article class="content-card"><span class="badge amber">${formatDate(e.date)}</span><h3>${escapeHtml(e.subject)}</h3><p>${escapeHtml(e.description || "Avaliação programada.")}</p><div class="card-meta"><span>Turma: ${escapeHtml(e.className)}</span><span>Horário: ${escapeHtml(e.time || "A definir")}</span><span>Professor: ${escapeHtml(e.authorName)}</span></div><div class="card-actions"><small>Postado em ${formatDate(e.createdAt)}</small>${actionButtons(e,"exams")}</div></article>`).join(""), "Nenhuma prova agendada.");
}
function renderMaterials() {
  emptyOrHtml($("#materialsList"), state.data.materials.map(m => `<article class="content-card file-card"><div class="file-icon">${escapeHtml((m.extension || "ARQ").toUpperCase().slice(0,4))}</div><span class="badge">${escapeHtml(m.category || "Material")}</span><h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.description || m.fileName)}</p><div class="card-meta"><span>${escapeHtml(m.authorName)}</span><span>${formatDate(m.createdAt)}</span></div><div class="card-actions"><a class="btn btn-secondary btn-small" href="${m.fileUrl}" target="_blank" rel="noopener">Abrir arquivo</a>${actionButtons(m,"materials")}</div></article>`).join(""), "Nenhum material enviado.");
}
function renderMinutes() {
  emptyOrHtml($("#minutesList"), state.data.minutes.map(m => `<article class="content-card"><span class="badge gray">Reunião · ${formatDate(m.meetingDate)}</span><h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.summary || "Ata pedagógica")}</p><div class="card-actions"><div class="card-meta"><span>Registrada por ${escapeHtml(m.authorName)}</span></div><div>${m.fileUrl ? `<a class="btn btn-secondary btn-small" href="${m.fileUrl}" target="_blank" rel="noopener">Abrir ata</a>` : ""} ${actionButtons(m,"minutes")}</div></div></article>`).join(""), "Nenhuma ata cadastrada.");
}
function renderJobs() {
  const jobs = state.data.jobs.filter(j => state.jobFilter === "all" || j.status === state.jobFilter);
  emptyOrHtml($("#jobsList"), jobs.map(j => `<article class="content-card"><span class="badge ${j.status === "disponivel" ? "green" : "gray"}">${j.status}</span><h3>${escapeHtml(j.title)}</h3><p>${escapeHtml(j.description)}</p><div class="card-meta"><span>${escapeHtml(j.company)}</span><span>${escapeHtml(j.location || "Local a combinar")}</span><span>Por ${escapeHtml(j.authorName)}</span></div><div class="card-actions">${j.contact ? `<a class="link-button" href="mailto:${escapeHtml(j.contact)}">Entrar em contato</a>` : "<span></span>"}<div>${canEdit(j) ? `<button class="btn btn-secondary btn-small" data-job-status="${j.id}" data-status="${j.status === "disponivel" ? "preenchida" : "disponivel"}">${j.status === "disponivel" ? "Marcar preenchida" : "Reabrir vaga"}</button> ${actionButtons(j,"jobs")}` : ""}</div></div></article>`).join(""), "Nenhuma vaga encontrada.");
}
function renderPartners() {
  const cards = state.data.partners.map(p => `<article class="content-card partner-card">${p.logoUrl ? `<img src="${p.logoUrl}" alt="Logo ${escapeHtml(p.name)}">` : `<div class="logo-placeholder">${initials(p.name)}</div>`}<h3>${escapeHtml(p.name)}</h3><div class="card-actions"><small>Empresa parceira</small>${actionButtons(p,"partners")}</div></article>`).join("");
  emptyOrHtml($("#partnersList"), cards, "Nenhuma empresa parceira.");
  emptyOrHtml($("#publicPartnersList"), cards, "Nenhuma empresa parceira.");
}
function renderUsers() {
  const rows = state.data.users.map(u => `<tr><td><div class="table-user"><span class="avatar">${initials(u.name)}</span><div><strong>${escapeHtml(u.name)}</strong><br><small>${escapeHtml(u.username)}</small></div></div></td><td><span class="badge ${u.role === "coordinator" ? "" : "gray"}">${u.role === "coordinator" ? "Coordenação" : "Professor"}</span></td><td>${u.active === false ? "Desativado" : "Ativo"}</td><td>${u.mustChangePassword ? "Senha provisória" : "Definida"}</td></tr>`).join("");
  emptyOrHtml($("#usersList"), rows ? `<table class="data-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Senha</th></tr></thead><tbody>${rows}</tbody></table>` : "", "Nenhum professor cadastrado.");
}

const forms = {
  post: { title: "Novo recado", kicker: "Comunicação", collection: "posts", fields: [
    ["title","Título","text",true],["noticeDate","Data do recado","date",true],["content","Mensagem","textarea",true]
  ], extra: { type: "recado" } },
  exam: { title: "Marcar prova", kicker: "Calendário", collection: "exams", fields: [
    ["subject","Disciplina / avaliação","text",true],["className","Turma","text",true],["date","Data da prova","date",true],["time","Horário","time",false],["description","Orientações","textarea",false]
  ] },
  material: { title: "Enviar material", kicker: "Biblioteca", collection: "materials", file: true, fields: [
    ["title","Título do material","text",true],["category","Categoria","select",true,["Aula","Exercícios","Apostila","Referência"]],["description","Descrição","textarea",false],["file","Arquivo (PDF, Word ou imagem)","file",true]
  ] },
  minute: { title: "Nova ata pedagógica", kicker: "Documentação", collection: "minutes", file: true, coordinator: true, fields: [
    ["title","Título da reunião","text",true],["meetingDate","Data da reunião","date",true],["summary","Resumo / decisões","textarea",true],["file","Arquivo da ata (opcional)","file",false]
  ] },
  job: { title: "Publicar vaga", kicker: "Oportunidade", collection: "jobs", fields: [
    ["title","Cargo / função","text",true],["company","Empresa","text",true],["location","Local","text",false],["contact","E-mail de contato","email",false],["description","Descrição da vaga","textarea",true],["status","Status","select",true,["disponivel","preenchida"]]
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
function openModal(type) {
  const config = forms[type]; if (!config || (config.coordinator && !isCoordinator())) return;
  modal.dataset.type = type; $("#modalTitle").textContent = config.title; $("#modalKicker").textContent = config.kicker;
  $("#modalFields").innerHTML = config.fields.map(([name,label,type,required,options]) => {
    const req = required ? "required" : "";
    if (type === "textarea") return `<label>${label}<textarea name="${name}" ${req}></textarea></label>`;
    if (type === "select") return `<label>${label}<select name="${name}" ${req}>${options.map(o => `<option value="${o}">${o[0].toUpperCase()+o.slice(1)}</option>`).join("")}</select></label>`;
    const accept = name === "file" ? 'accept=".pdf,.doc,.docx,image/*"' : "";
    return `<label>${label}<input name="${name}" type="${type}" ${req} ${accept}></label>`;
  }).join("");
  if (type === "user") $('[name="temporaryPassword"]', modal).value = generatePassword();
  modal.showModal();
}
$("#dynamicForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (e.submitter?.value === "cancel") return modal.close();
  const config = forms[modal.dataset.type], data = Object.fromEntries(new FormData(e.currentTarget));
  const button = $("#modalSubmit"); button.disabled = true; button.textContent = "Salvando...";
  try {
    if (config.special === "user") throw new Error("No plano gratuito, o professor deve criar a própria conta na tela inicial.");
    await saveRecord(config, data, new FormData(e.currentTarget).get("file"));
    modal.close(); e.currentTarget.reset(); toast("Salvo com sucesso."); await loadAll();
  } catch (err) { console.error(err); toast(err.message || "Não foi possível salvar.", true); }
  finally { button.disabled = false; button.textContent = "Salvar"; }
});

async function saveRecord(config, data, file) {
  delete data.file;
  Object.assign(data, config.extra || {}, { authorId: state.user.uid, authorName: state.profile.name, authorRole: state.profile.role, createdAt: serverTimestamp() });
  if (file?.size) {
    const uploaded = await uploadFileToDrive(file, config.collection);
    data.fileUrl = config.collection === "partners" ? undefined : uploaded.url;
    data.logoUrl = config.collection === "partners" ? uploaded.url : undefined;
    data.driveFileId = uploaded.fileId;
    data.fileName = file.name; data.extension = file.name.split(".").pop();
  }
  await addDoc(collection(db, config.collection), data);
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
  const maxBytes = driveUploadConfig.maxFileSizeMb * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(`O arquivo deve ter no máximo ${driveUploadConfig.maxFileSizeMb} MB.`);
  const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error("Formato não permitido. Envie PDF, Word, JPG, PNG ou WEBP.");

  const progress = document.createElement("div");
  progress.className = "progress"; progress.innerHTML = "<span></span>"; $("#modalFields").append(progress);
  const setProgress = value => progress.firstElementChild.style.width = `${value}%`;
  const base64 = await fileToBase64(file, setProgress);
  setProgress(55);

  const result = await postToDrive({
    action: "upload", fileName: file.name, mimeType: file.type, category,
    authorName: state.profile.name, fileData: base64
  }, 120000);
  setProgress(100);
  return result;
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
