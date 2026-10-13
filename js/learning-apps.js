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
  const info = document.createElement('div');
  info.className = 'book-info';
  const title = document.createElement('h2');
  title.textContent = app.title;
  const description = document.createElement('p');
  description.textContent = app.description || '';
  const link = document.createElement('a');
  link.className = 'button';
  link.href = app.url;
  link.textContent = '開く';
  info.append(title, description, link);
  article.append(info);
  container.append(article);
}
