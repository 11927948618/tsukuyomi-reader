// The server advertises this app only on the authenticated Reader deployment.
export async function loadLearningApp() {
  try {
    const response = await fetch('/api/apps/wanwan', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return null;
    const app = await response.json();
    if (!app || typeof app.title !== 'string' || app.url !== '/apps/wanwan/') return null;
    return app;
  } catch { return null; }
}
export function mountLearningApp(container, app) {
  if (!container || !app || app.url !== '/apps/wanwan/') return;
  const article = document.createElement('article');
  article.className = 'book-card';
  article.dataset.searchText = app.title.toLowerCase();
  const cover = document.createElement('div');
  cover.className = 'book-cover';
  const badge = document.createElement('span');
  badge.className = 'book-cover-placeholder';
  badge.textContent = '地図';
  cover.append(badge);
  const info = document.createElement('div');
  info.className = 'book-info';
  const title = document.createElement('h2');
  title.className = 'book-title';
  title.textContent = app.title;
  const kind = document.createElement('p');
  kind.className = 'book-author';
  kind.textContent = '学習アプリ';
  const description = document.createElement('p');
  description.className = 'book-description';
  description.textContent = app.description || '';
  const link = document.createElement('a');
  link.className = 'button book-read-button';
  link.href = app.url;
  link.textContent = '開く';
  info.append(title, kind, description, link);
  article.append(cover, info);
  container.append(article);
}
