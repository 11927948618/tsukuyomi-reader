import { escapeHtml } from "./utils.js";

const TOKEN_KEY = "tsukuyomi:adminToken";
const adminToken = document.getElementById("adminToken");
const saveTokenBtn = document.getElementById("saveTokenBtn");
const clearTokenBtn = document.getElementById("clearTokenBtn");
const bookForm = document.getElementById("bookForm");
const resetFormBtn = document.getElementById("resetFormBtn");
const reloadBooksBtn = document.getElementById("reloadBooksBtn");
const adminBookList = document.getElementById("adminBookList");
const adminStatus = document.getElementById("adminStatus");
const updatedAt = document.getElementById("updatedAt");

adminToken.value = localStorage.getItem(TOKEN_KEY) || "";
updatedAt.value = new Date().toISOString().slice(0, 10);

saveTokenBtn?.addEventListener("click", () => {
  localStorage.setItem(TOKEN_KEY, adminToken.value || "");
  setStatus("管理トークンを保存しました", "ok");
  loadBooks();
});

clearTokenBtn?.addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  adminToken.value = "";
  setStatus("管理トークンを消去しました");
});

reloadBooksBtn?.addEventListener("click", loadBooks);
resetFormBtn?.addEventListener("click", resetForm);

bookForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = getToken();
  if (!token) {
    setStatus("管理トークンを入力してください", "error");
    return;
  }

  const formData = new FormData(bookForm);
  formData.set("published", document.getElementById("publishedCheck")?.checked ? "true" : "false");

  setStatus("保存中...");
  try {
    const res = await fetch("./api/admin/books", {
      method: "POST",
      headers: authHeaders(token),
      body: formData
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "保存に失敗しました");
    setStatus("保存しました", "ok");
    resetForm();
    loadBooks();
  } catch (err) {
    setStatus(err.message || "保存に失敗しました", "error");
  }
});

async function loadBooks() {
  const token = getToken();
  if (!token) {
    setStatus("管理トークンを入力してください");
    return;
  }

  setStatus("作品一覧を読み込み中...");
  try {
    const res = await fetch("./api/admin/books", {
      headers: authHeaders(token)
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "作品一覧の読み込みに失敗しました");
    renderBooks(Array.isArray(payload?.books) ? payload.books : []);
    setStatus(`${payload.books?.length || 0}件`, "ok");
  } catch (err) {
    adminBookList.innerHTML = "";
    setStatus(err.message || "作品一覧の読み込みに失敗しました", "error");
  }
}

function renderBooks(books) {
  if (!books.length) {
    adminBookList.innerHTML = `<p class="admin-note">作品はまだ登録されていません。</p>`;
    return;
  }

  adminBookList.innerHTML = books
    .map((book) => {
      const cover = book.published === true && book.cover
        ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title || "")} 表紙" />`
        : "";
      const published = book.published === true;
      return `
        <article class="admin-book-card" data-book-id="${escapeHtml(book.id || "")}">
          <div class="admin-book-cover">${cover}</div>
          <div class="admin-book-info">
            <h3 class="admin-book-title">${escapeHtml(book.title || "Untitled")}</h3>
            <p class="admin-book-meta">${escapeHtml(book.author || "")}</p>
            <p class="admin-book-meta">${escapeHtml(book.description || "")}</p>
            <p class="admin-book-meta">ID: ${escapeHtml(book.id || "")} / 更新日: ${escapeHtml(book.updatedAt || "-")}</p>
            <span class="admin-pill ${published ? "published" : "private"}">${published ? "公開中" : "非公開"}</span>
            <div class="admin-book-actions">
              <button class="button ghost" type="button" data-action="edit">編集に読み込む</button>
              <button class="button ghost" type="button" data-action="toggle">${published ? "公開停止" : "公開する"}</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  adminBookList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-book-id]");
      const id = card?.dataset.bookId || "";
      const book = books.find((entry) => entry.id === id);
      if (!book) return;
      if (button.dataset.action === "edit") {
        fillForm(book);
      } else {
        togglePublished(book);
      }
    });
  });
}

async function togglePublished(book) {
  const token = getToken();
  if (!token) {
    setStatus("管理トークンを入力してください", "error");
    return;
  }

  const nextPublished = book.published !== true;
  setStatus(nextPublished ? "公開へ変更中..." : "公開停止中...");
  try {
    const res = await fetch(`./api/admin/books/${encodeURIComponent(book.id)}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify({ published: nextPublished })
    });
    const payload = await readJson(res);
    if (!res.ok) throw new Error(payload?.error || "公開状態の変更に失敗しました");
    setStatus(nextPublished ? "公開しました" : "公開停止しました", "ok");
    loadBooks();
  } catch (err) {
    setStatus(err.message || "公開状態の変更に失敗しました", "error");
  }
}

function fillForm(book) {
  bookForm.elements.id.value = book.id || "";
  bookForm.elements.title.value = book.title || "";
  bookForm.elements.author.value = book.author || "";
  bookForm.elements.description.value = book.description || "";
  bookForm.elements.updatedAt.value = book.updatedAt || new Date().toISOString().slice(0, 10);
  document.getElementById("publishedCheck").checked = book.published === true;
  setStatus("編集内容をフォームに読み込みました。EPUB/表紙は必要な場合だけ選択してください。");
}

function resetForm() {
  bookForm.reset();
  bookForm.elements.author.value = "hal the juggernaut";
  bookForm.elements.updatedAt.value = new Date().toISOString().slice(0, 10);
  document.getElementById("publishedCheck").checked = true;
}

function getToken() {
  return adminToken.value || localStorage.getItem(TOKEN_KEY) || "";
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`
  };
}

async function readJson(res) {
  try {
    return await res.json();
  } catch (err) {
    return null;
  }
}

function setStatus(message, type = "") {
  if (!adminStatus) return;
  adminStatus.textContent = message;
  adminStatus.className = `status ${type}`.trim();
}

loadBooks();
