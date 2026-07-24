/**
 * Portal Mecânica Industrial — upload gratuito para Google Drive.
 *
 * 1. Substitua FOLDER_ID pelo ID da pasta do Drive.
 * 2. Crie um token longo e aleatório em UPLOAD_TOKEN.
 * 3. Implante como Aplicativo da Web, executando como "Eu".
 * 4. Em "Quem pode acessar", escolha "Qualquer pessoa".
 * 5. Copie a URL /exec para firebase-config.js.
 */
const FOLDER_ID = "1vi-yP5b4izy87DdQ6kidCMmD4qcAmteD";
const UPLOAD_TOKEN = "mec_2026_X9rT82pL_4kQ7zA_196579678";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp"
];

function doGet() {
  return HtmlService.createHtmlOutput("Portal Mecânica Industrial: integração ativa.");
}

function doPost(event) {
  const requestId = event.parameter.requestId || "";
  try {
    if (event.parameter.token !== UPLOAD_TOKEN) throw new Error("Acesso não autorizado.");
    const action = event.parameter.action;
    if (action === "upload") return respond_(upload_(event.parameter), requestId);
    if (action === "delete") return respond_(delete_(event.parameter.fileId), requestId);
    throw new Error("Operação inválida.");
  } catch (error) {
    return respond_({ ok: false, error: error.message }, requestId);
  }
}

function upload_(data) {
  if (!ALLOWED_MIME_TYPES.includes(data.mimeType)) throw new Error("Formato de arquivo não permitido.");
  const bytes = Utilities.base64Decode(data.fileData || "");
  if (!bytes.length || bytes.length > MAX_FILE_SIZE) throw new Error("Arquivo vazio ou maior que 10 MB.");

  const root = DriveApp.getFolderById(FOLDER_ID);
  const categoryFolder = getOrCreateFolder_(root, sanitize_(data.category || "materiais"));
  const authorFolder = getOrCreateFolder_(categoryFolder, sanitize_(data.authorName || "Professor"));
  const safeName = `${new Date().toISOString().slice(0, 10)}_${sanitizeFileName_(data.fileName)}`;
  const file = authorFolder.createFile(Utilities.newBlob(bytes, data.mimeType, safeName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    fileId: file.getId(),
    fileName: file.getName(),
    url: `https://drive.google.com/file/d/${file.getId()}/view`
  };
}

function delete_(fileId) {
  if (!fileId) throw new Error("Arquivo não informado.");
  DriveApp.getFileById(fileId).setTrashed(true);
  return { ok: true };
}

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function sanitize_(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 80) || "Geral";
}

function sanitizeFileName_(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 150) || "arquivo";
}

function respond_(payload, requestId) {
  const message = JSON.stringify({ source: "sitemec-drive", requestId, ...payload }).replace(/</g, "\\u003c");
  return HtmlService
    .createHtmlOutput(`<script>window.parent.postMessage(${message}, "*");</script>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
