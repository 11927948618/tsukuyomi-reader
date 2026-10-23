import {normalizeFolderPath,authorName} from './content-folders.js';
const LIMIT=256*1024*1024,MAX_FILE=64*1024*1024,MAX_FILES=500;
const allowed=/\.(txt|md|markdown|epub|pdf)$/i;
export async function contentHash(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('')}
export function locationFromFile(path){const safe=normalizeFolderPath(path),parts=safe.split('/'),file=parts.pop();return {author:parts.shift()||'作者未設定',folderPath:parts.join('/'),title:file.replace(/\.[^.]+$/,''),filename:file}}
export function createContentManager({list,getHeaders,prepareUpload,reload}){
 let books=[],folders=[],scope='limited',author='',path='',plan=[],importFolders=[],running=false,stop=false;
 const host=document.createElement('section');host.className='content-manager';host.innerHTML='<h3>フォルダと一括操作</h3><nav id="contentBreadcrumb"></nav><div id="contentFolderList" class="content-folder-grid"></div><div class="content-manager-actions"><button type="button" data-cm="create">新しいフォルダ</button><button type="button" data-cm="rename">このフォルダを移動・名前変更</button><button type="button" data-cm="move">選んだ作品を移動</button></div><details><summary>まとめて取り込む・バックアップ</summary><p>フォルダは「作者/分類/作品」の順で取り込みます。同じ作品IDは上書きせずスキップします。復元先は限定レビュー・非公開です。</p><p>1回500作品・合計256MBまで（1ファイル64MB）。通常ZIPはTXT・Markdown・EPUB・PDFに対応します。</p><label>フォルダ取込<input id="contentFolderInput" type="file" webkitdirectory multiple></label><label>ZIP取込<input id="contentZipInput" type="file" accept=".zip,application/zip"></label><button type="button" data-cm="backup">この一覧を一括バックアップ</button><div id="contentImportPreview"></div><button type="button" data-cm="import" disabled>確認した内容を取り込む</button><button type="button" data-cm="stop" hidden>次の作品で停止</button></details><p id="contentManagerStatus" role="status"></p>';
 list.before(host);
 const $=s=>host.querySelector(s),status=text=>{$('#contentManagerStatus').textContent=text};
 const endpoint=(suffix='')=>'./api/admin/books'+suffix;
 async function request(url,options={}){const res=await fetch(url,{...options,headers:{...getHeaders(),...(options.headers||{})}});if(!res.ok){const d=await res.json().catch(()=>({}));throw Error(d.error||'通信に失敗しました（'+res.status+'）')}return res}
 async function jsonRequest(url,data,method='POST'){return (await request(url,{method,headers:{'content-type':'application/json'},body:JSON.stringify(data)})).json()}
 function ask(title,initialAuthor='',initialPath=''){
  return new Promise(resolve=>{const d=document.createElement('dialog');d.className='content-location-dialog';const h=document.createElement('h3');h.textContent=title;const form=document.createElement('form');form.method='dialog';form.innerHTML='<label>作者<input name="author" required maxlength="200"></label><label>作者内フォルダ<input name="path" placeholder="短編/初期作品"></label><p>作者内フォルダを空欄にすると、その作者の直下です。</p><button value="save">保存</button><button value="cancel" formnovalidate>キャンセル</button>';form.elements.author.value=initialAuthor;form.elements.path.value=initialPath;d.append(h,form);document.body.append(d);d.onclose=()=>{const value=d.returnValue==='save'?{author:form.elements.author.value.trim(),path:form.elements.path.value}:null;d.remove();resolve(value)};d.showModal()})
 }
 function render(){
  const nav=$('#contentBreadcrumb');nav.replaceChildren();const home=document.createElement('button');home.textContent='作者一覧';home.onclick=()=>{author='';path='';render()};nav.append(home);
  if(author){const b=document.createElement('button');b.textContent=author;b.onclick=()=>{path='';render()};nav.append(' / ',b);const parts=path.split('/').filter(Boolean);for(let i=0;i<parts.length;i++){const b=document.createElement('button');b.textContent=parts[i];b.onclick=()=>{path=parts.slice(0,i+1).join('/');render()};nav.append(' / ',b)}}
  const nodes=$('#contentFolderList');nodes.replaceChildren();const children=new Set();
  for(const item of [...books.map(b=>({author:authorName(b),path:b.folderPath||''})),...folders]){
   if(!author)children.add(item.author||'作者未設定');else if(item.author===author){const folder=item.path||'';if(!path||folder.startsWith(path+'/')){const rest=folder.slice(path?path.length+1:0);if(rest)children.add(rest.split('/')[0])}}
  }
  for(const name of [...children].sort((a,b)=>a.localeCompare(b,'ja'))){const b=document.createElement('button');b.textContent='📁 '+name;b.onclick=()=>{if(author)path=[path,name].filter(Boolean).join('/');else author=name;render()};nodes.append(b)}
  for(const card of list.querySelectorAll('[data-book-id]')){const book=books.find(b=>b.id===card.dataset.bookId);if(!book)continue;card.hidden=!author||authorName(book)!==author||(book.folderPath||'')!==path;if(!card.querySelector('[data-select-book]')){const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.dataset.selectBook=book.id;label.append(check,' 選択');card.prepend(label)}}
  $('[data-cm=rename]').disabled=!author||running;
 }
 function selected(){return [...list.querySelectorAll('[data-select-book]:checked')].filter(e=>!e.closest('[data-book-id]').hidden).map(e=>e.dataset.selectBook)}
 function preview(){const box=$('#contentImportPreview');box.replaceChildren();const title=document.createElement('p');title.textContent=plan.length+'作品 / '+importFolders.length+'フォルダを確認';box.append(title);const ul=document.createElement('ul');for(const r of plan){const li=document.createElement('li');const heading=document.createElement('span');heading.textContent=[r.author,r.folderPath,r.title].filter(Boolean).join(' / ')+(books.some(b=>b.id===r.id)?'（同IDあり：スキップ）':'');li.append(heading);for(const [key,labelText] of [['author','作者'],['folderPath','作者内フォルダ'],['title','作品名']]){const label=document.createElement('label'),input=document.createElement('input');label.textContent=labelText;input.value=r[key]||'';input.oninput=()=>{r[key]=input.value};label.append(input);li.append(label)}ul.append(li)}box.append(ul);$('[data-cm=import]').disabled=(!plan.length&&!importFolders.length)||running}
 async function stage(files,metadata=null){
  if(running)return;plan=[];importFolders=[];let total=0;
  if(files.length>MAX_FILES)throw Error('一度に取り込めるのは500ファイルまでです');
  for(const item of files){const file=item.file,relative=normalizeFolderPath(item.path);if(!allowed.test(relative)&&!item.metadata)continue;if(file.size>MAX_FILE)throw Error('1ファイル64MBまでです');total+=file.size;if(total>LIMIT)throw Error('一括取込は合計256MBまでです');
   const meta=item.metadata||{},loc=locationFromFile(relative),id=meta.id||'bulk-'+(await contentHash(file)).slice(0,32);
   if(!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw Error('作品IDを確認してください');
   if(plan.some(r=>r.id===id))throw Error('同じ内容または同じ作品IDが取込内で重複しています：'+relative);
   plan.push({...loc,...meta,id,author:String(meta.author??loc.author).trim()||'作者未設定',folderPath:normalizeFolderPath(meta.folderPath??loc.folderPath),file,cover:item.cover||null});
  }
  if(metadata&&(!Array.isArray(metadata.folders||[])||(metadata.folders||[]).length>2000))throw Error('フォルダ情報を確認してください');
  if(metadata)importFolders=(metadata.folders||[]).map(f=>({author:String(f.author||'').trim()||'作者未設定',path:normalizeFolderPath(f.path||'')}));
  preview();status('一覧を確認してから「取り込む」を押してください。対応外ファイルは取り込みません。');
 }
 async function stageZip(file){
  if(file.size>LIMIT)throw Error('ZIPは256MBまでです');const zip=await globalThis.JSZip.loadAsync(file),entries=Object.values(zip.files).filter(f=>!f.dir);if(entries.length>MAX_FILES*3)throw Error('ZIP内のファイル数が多すぎます');let declared=0;
  for(const entry of entries){normalizeFolderPath(entry.unsafeOriginalName||entry.name);declared+=Number(entry._data?.uncompressedSize)||0;if(declared>LIMIT)throw Error('展開後256MBまでです')}
  const manifest=zip.file('tsukuyomi-library.json');const metadata=manifest?JSON.parse(await manifest.async('string')):null;
  const items=[];let actual=0;
  async function blob(entry){if(!entry)throw Error('バックアップ内のファイルが不足しています');const b=await entry.async('blob');actual+=b.size;if(b.size>MAX_FILE||actual>LIMIT)throw Error('展開後の上限を超えています');return b}
  if(metadata){if(metadata.schemaVersion!==1||!Array.isArray(metadata.books)||metadata.books.length>MAX_FILES)throw Error('バックアップ形式を確認してください');for(const book of metadata.books){const source=normalizeFolderPath(book.file),b=await blob(zip.file(source));if(!book.sha256||await contentHash(b)!==book.sha256)throw Error('本文のハッシュが一致しません：'+source);let cover=null;if(book.coverFile){const c=await blob(zip.file(normalizeFolderPath(book.coverFile)));if(!book.coverSha256||await contentHash(c)!==book.coverSha256)throw Error('表紙のハッシュが一致しません');cover=new File([c],book.coverFile.split('/').pop(),{type:c.type})}items.push({path:source,file:new File([b],source.split('/').pop(),{type:b.type}),metadata:book,cover})}}
  else for(const entry of entries){if(!allowed.test(entry.name)||entry.name.startsWith('__MACOSX/'))continue;const b=await blob(entry);items.push({path:entry.name,file:new File([b],entry.name.split('/').pop(),{type:b.type})})}
  await stage(items,metadata);
 }
 $('#contentFolderInput').onchange=e=>stage([...e.target.files].map(file=>({file,path:file.webkitRelativePath||file.name}))).catch(e=>{plan=[];importFolders=[];preview();status(e.message)});
 $('#contentZipInput').onchange=e=>{const file=e.target.files[0];if(file)stageZip(file).catch(e=>{plan=[];importFolders=[];preview();status(e.message)})};
 $('[data-cm=stop]').onclick=()=>{stop=true};
 async function importAll(){if(running)return;if(scope!=='limited')return status('取込先は限定レビューです。限定レビューの一覧に切り替えてください。');for(const r of plan){try{r.folderPath=normalizeFolderPath(r.folderPath);if(!String(r.author||'').trim()||!String(r.title||'').trim())throw Error('作者と作品名を入力してください')}catch(e){return status(e.message)}}const existingIds=new Set(books.map(b=>b.id));running=true;stop=false;$('[data-cm=import]').disabled=true;$('[data-cm=stop]').hidden=false;try{
   for(const f of importFolders){if(stop)break;await jsonRequest('./api/admin/folders',{action:'create',...f})}
   let done=0,skipped=0;
   for(const r of plan){if(stop)break;if(r.done||existingIds.has(r.id)){skipped++;continue}const form=new FormData();for(const k of ['id','title','author','folderPath','description','contentType','version','entry','updatedAt'])if(r[k]!=null)form.set(k,String(r[k]));form.set('published','false');form.set('createOnly','true');form.set('bookFile',r.file);if(r.cover)form.set('cover',r.cover);status((done+skipped+1)+' / '+plan.length+'：'+r.title);await request(endpoint(),{method:'POST',body:await prepareUpload(form)});r.done=true;done++}
   await reload();status('取込 '+done+'件 / スキップ '+skipped+'件'+(stop?'（停止しました）':''));
  }catch(e){await reload().catch(()=>{});status('途中で停止：'+e.message+'。完了分は保存されています。再実行では上書きしません。')}finally{running=false;$('[data-cm=stop]').hidden=true;preview();render()}}
 async function backup(){if(running)return;running=true;try{const snapshot=books.map(b=>({...b})),backupScope=scope,backupFolders=structuredClone(folders),zip=new globalThis.JSZip(),manifest={schemaVersion:1,scope:backupScope,createdAt:new Date().toISOString(),folders:backupFolders,books:[]};let total=0;
  if(snapshot.length>MAX_FILES)throw Error('一括バックアップは500作品までです');
  for(let i=0;i<snapshot.length;i++){const b=snapshot[i];status('バックアップ '+(i+1)+' / '+snapshot.length+'：'+b.title);const file=await (await request(endpoint('/'+encodeURIComponent(b.id)+'/file?scope='+backupScope))).blob();total+=file.size;if(file.size>MAX_FILE)throw Error('1作品64MBまでの一括バックアップに対応しています：'+b.title);if(total>LIMIT)throw Error('バックアップは合計256MBまでです');const filePath='files/'+b.id+'.'+b.format;zip.file(filePath,file);const row={...b,file:filePath,sha256:await contentHash(file)};delete row.contentKey;delete row.coverKey;if(b.coverKey||b.cover){const cover=await (await request(endpoint('/'+encodeURIComponent(b.id)+'/file?scope='+backupScope+'&kind=cover'))).blob();total+=cover.size;if(cover.size>MAX_FILE)throw Error('表紙のサイズが上限を超えています');if(total>LIMIT)throw Error('バックアップは合計256MBまでです');row.coverFile='covers/'+b.id+'.'+(b.coverKey?.split('.').pop()||'png');row.coverSha256=await contentHash(cover);zip.file(row.coverFile,cover)}manifest.books.push(row)}
  zip.file('tsukuyomi-library.json',JSON.stringify(manifest,null,2));const blob=await zip.generateAsync({type:'blob'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tsukuyomi-'+backupScope+'-'+new Date().toISOString().slice(0,10)+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('本文・表紙・作品情報・フォルダを保存しました。')
 }catch(e){status(e.message)}finally{running=false;render()}}
 host.addEventListener('click',async e=>{const action=e.target.closest('[data-cm]')?.dataset.cm;if(!action||running)return;try{
  if(action==='backup')return await backup();if(action==='import')return await importAll();
  if(action==='move'){const ids=selected();if(!ids.length)return status('移動する作品を選んでください');const loc=await ask(ids.length+'作品の移動先',author,path);if(!loc)return;loc.path=normalizeFolderPath(loc.path);for(const id of ids)await jsonRequest(endpoint('/'+encodeURIComponent(id)+'?scope='+scope),{author:loc.author,folderPath:loc.path},'PATCH');await reload();status(ids.length+'作品を移動しました');return}
  if(action==='create'||action==='rename'){const loc=await ask(action==='create'?'新しいフォルダ':'フォルダの移動・名前変更',author,path);if(!loc)return;loc.path=normalizeFolderPath(loc.path);await jsonRequest('./api/admin/folders?scope='+scope,{action:action==='create'?'create':'move',...loc,fromAuthor:author,fromPath:path});author=loc.author;path=loc.path;await reload();status('フォルダを保存しました')}
 }catch(e){status(e.message)}});
 return {setCatalog(next,nextFolders=[],nextScope='limited'){if(scope!==nextScope){author='';path=''}books=next;folders=nextFolders;scope=nextScope;$('[data-cm=backup]').textContent=(scope==='limited'?'限定レビュー':'一般公開')+'の全作品をバックアップ';render()}};
}
