export function normalizeFolderPath(value='') {
 const path=String(value).normalize('NFC').replace(/\\/g,'/');
 if(path.startsWith('/')||/[\x00-\x1f:]/.test(path))throw Error('フォルダは相対パスで指定してください');
 const parts=path.split('/').filter(Boolean).map(p=>p.trim());
 if(parts.some(p=>!p||p==='.'||p==='..')||parts.length>12||path.length>500)throw Error('フォルダ名・階層を確認してください');
 return parts.join('/');
}
export function authorName(book){return String(book.author||'').trim()||'作者未設定'}
export function mountAuthorFolders(list) {
 const cards=[...list.children].filter(e=>e.dataset.authorName!==undefined);
 const root=new Map();
 for(const card of cards){
  const parts=[card.dataset.authorName||'作者未設定',...normalizeFolderPath(card.dataset.folderPath||'').split('/').filter(Boolean)];let parent=list;
  for(let i=0;i<parts.length;i++){
   const key=JSON.stringify(parts.slice(0,i+1));let node=root.get(key);
   if(!node){node=document.createElement('details');node.className='content-folder';const summary=document.createElement('summary');summary.textContent='📁 '+parts[i];node.append(summary);parent.append(node);root.set(key,node)}
   parent=node;
  }
  parent.append(card);
 }
 for(const node of root.values()){const count=node.querySelectorAll('.book-card').length;node.querySelector('summary').append('（'+count+'作品）')}
}
