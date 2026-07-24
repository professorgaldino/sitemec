# Portal Mecânica Industrial

Portal acadêmico para GitHub Pages, usando Firebase Spark para autenticação/dados e Google Drive com Apps Script para arquivos.

## Serviços sem custo

- Firebase Authentication: contas e login.
- Cloud Firestore: recados, provas, vagas e metadados.
- Google Drive: PDF, Word, imagens e logotipos.
- Google Apps Script: envio automático dos arquivos.
- GitHub Pages: hospedagem do portal.

Não é necessário Firebase Storage, Cloud Functions ou plano Blaze.

## Acesso público dos alunos

O portal abre diretamente na área pública do aluno, sem usuário ou senha. A página inicial apresenta cada espaço e oferece acesso a recados, provas, materiais, vagas e empresas parceiras. Atas pedagógicas, publicações e administração continuam protegidas pelo botão **Área do professor** e pelo login.

Depois de alterar `firestore.rules`, publique novamente:

`firebase deploy --only firestore:rules`

## 1. Configurar o Firebase

1. No Console Firebase, ative **Authentication > E-mail/senha**.
2. Crie apenas o banco **Cloud Firestore**.
3. Instale a CLI: `npm install -g firebase-tools`
4. Entre na conta: `firebase login`
5. Na pasta do projeto: `firebase use sitemec-89171`
6. Publique somente as regras: `firebase deploy --only firestore:rules`

## 2. Configurar o Google Drive e Apps Script

1. Crie uma pasta no Google Drive para os materiais.
2. Copie o ID exibido depois de `/folders/` no endereço da pasta.
3. Acesse `https://script.google.com` e crie um projeto.
4. Copie todo o conteúdo de `google-apps-script.gs` para o editor.
5. Troque `COLE_AQUI_O_ID_DA_PASTA` pelo ID da pasta.
6. Crie um token aleatório longo e coloque em `UPLOAD_TOKEN`. Exemplo de formato: `mec_2026_uma_frase_longa_aleatoria_9384`.
7. Clique em **Implantar > Nova implantação > Aplicativo da Web**.
8. Configure **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**.
9. Autorize o acesso solicitado e copie a URL terminada em `/exec`.
10. Em `firebase-config.js`, preencha `webAppUrl` e repita exatamente o mesmo `uploadToken`.

O portal limita cada arquivo a 10 MB e aceita PDF, DOC, DOCX, JPG, PNG e WEBP. O Apps Script cria subpastas por categoria e professor.

## 3. Criar o primeiro coordenador

1. Cadastre-se normalmente pelo portal.
2. No Firestore, abra `users/{seu-uid}`.
3. Altere o campo `role` de `teacher` para `coordinator`.
4. Saia e entre novamente.

No plano gratuito, cada professor cria sua própria conta. Alterações administrativas de contas do Firebase Auth são realizadas pelo Console Firebase.

## 4. Publicar no GitHub Pages

Envie os arquivos para um repositório no GitHub. Em **Settings > Pages**, selecione **Deploy from a branch**, a branch `main` e a pasta `/ (root)`.

Adicione `seuusuario.github.io` em **Firebase Authentication > Settings > Authorized domains**.

## Testar no computador

Não abra `index.html` diretamente, pois módulos do Firebase são bloqueados em endereços `file://`.

Para testar:

1. Dê dois cliques em `INICIAR-PORTAL.bat`.
2. Aguarde o navegador abrir `http://localhost:5500`.
3. Mantenha a janela minimizada do servidor aberta durante o teste.
4. Para encerrar, feche a janela chamada **Servidor Portal Mecânica**.

## Limites gratuitos

Uma conta Google comum oferece até 15 GB compartilhados entre Drive, Gmail e Google Fotos. Ao atingir o limite, novos uploads falham; não ocorre cobrança automática sem contratação de armazenamento adicional. O Apps Script também possui cotas diárias gratuitas e encerra temporariamente operações que ultrapassarem essas cotas.
