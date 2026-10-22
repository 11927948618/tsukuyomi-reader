import asyncio,json,zipfile,io
from pathlib import Path
from functools import partial
from threading import Thread
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',8941),partial(Handler,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await b.new_page(viewport={'width':900,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://127.0.0.1:8941/css/base.css')
  await page.set_content('<link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/admin.css"><div id="list"></div><script src="/vendor/jszip.min.js"></script>')
  await page.evaluate('''async()=>{
   const {createContentManager}=await import('/js/content-manager.js');
   window.rows=[{id:'one',title:'作品一',author:'作者A',folderPath:'短編',format:'txt',contentKey:'one.txt',coverKey:'one.png',published:false},{id:'two',title:'作品二',author:'作者B',folderPath:'',format:'txt',contentKey:'two.txt',coverKey:'two.png',published:true}];
   window.folders=[{author:'作者A',path:'空フォルダ'}];window.files={one:new Blob(['本文一']),two:new Blob(['本文二'])};window.covers={one:new Blob(['表紙']),two:new Blob(['表紙二'])};window.operations=[];
   const realFetch=window.fetch;
   window.fetch=async(url,options={})=>{
    if(!String(url).includes('/api/admin/'))return realFetch(url,options);
    const method=options.method||'GET';window.operations.push([method,String(url)]);
    if(String(url).includes('/file?')){const id=String(url).split('/books/')[1].split('/')[0];return new Response(String(url).includes('kind=cover')?covers[id]:files[id])}
    if(method==='POST'&&String(url).endsWith('/books')){const form=options.body;const id=form.get('id');if(rows.some(b=>b.id===id))return Response.json({error:'duplicate'},{status:409});const row=Object.fromEntries([...form.entries()].filter(([k,v])=>typeof v==='string'));row.published=false;if(form.get('cover')){covers[id]=form.get('cover');row.coverKey=id+'.png'}files[id]=form.get('bookFile');rows.push(row);return Response.json({ok:true})}
    if(String(url).includes('/folders')){const data=JSON.parse(options.body);folders.push({author:data.author,path:data.path});return Response.json({ok:true})}
    if(method==='PATCH'){const id=String(url).split('/books/')[1].split('?')[0];Object.assign(rows.find(b=>b.id===id),JSON.parse(options.body));return Response.json({ok:true})}
    return Response.json({error:'unhandled'},{status:500});
   };
   window.reload=async()=>{const list=document.getElementById('list');list.replaceChildren();for(const row of rows){const card=document.createElement('article');card.className='admin-book-card';card.dataset.bookId=row.id;card.textContent=row.title;list.append(card)}window.manager.setCatalog(rows,folders,'limited')};
   window.manager=createContentManager({list:document.getElementById('list'),getHeaders:()=>({}),prepareUpload:async f=>f,reload:window.reload});await reload();
  }''')
  await page.locator('#contentFolderList button',has_text='作者A').click()
  await page.locator('#contentFolderList button',has_text='短編').click()
  assert await page.locator('[data-book-id=one]').is_visible()
  assert not await page.locator('[data-book-id=two]').is_visible()
  await page.locator('[data-select-book=one]').check()
  await page.locator('[data-cm=move]').click()
  await page.locator('dialog input[name=author]').fill('作者B');await page.locator('dialog input[name=path]').fill('移動先')
  await page.locator('dialog button[value=save]').click()
  await page.wait_for_function('rows[0].folderPath==="移動先"')
  assert await page.evaluate('rows[0].id')=='one'
  await page.locator('.content-manager details summary').click()
  async with page.expect_download() as wait:
   await page.locator('[data-cm=backup]').click()
  download=await wait.value;backup=Path('/tmp/reader-folder-backup.zip');await download.save_as(backup)
  with zipfile.ZipFile(backup) as z:
   manifest=json.loads(z.read('tsukuyomi-library.json'));assert len(manifest['books'])==2 and manifest['folders'];assert z.read('files/one.txt').decode()=='本文一'
  await page.evaluate('rows=rows.filter(b=>b.id==="one");folders=[];reload()')
  await page.locator('#contentZipInput').set_input_files(str(backup));await page.wait_for_function('!document.querySelector("[data-cm=import]").disabled')
  assert '同IDあり' in await page.locator('#contentImportPreview').inner_text()
  await page.locator('[data-cm=import]').click();await page.wait_for_function('rows.length===2')
  assert await page.evaluate('rows.find(b=>b.id==="two").published') is False
  assert await page.evaluate('folders.some(f=>f.path==="空フォルダ")')
  assert await page.evaluate('covers.two.text()')=='表紙二'
  # A bad file must be rejected during preview, before any writes.
  corrupted=Path('/tmp/reader-folder-corrupt.zip')
  with zipfile.ZipFile(backup) as src,zipfile.ZipFile(corrupted,'w') as dst:
   for n in src.namelist():dst.writestr(n,b'corrupted' if n=='files/one.txt' else src.read(n))
  before=await page.evaluate('operations.filter(x=>x[0]==="POST").length')
  await page.locator('#contentZipInput').set_input_files(str(corrupted));await page.wait_for_function('document.querySelector("#contentManagerStatus").textContent.includes("ハッシュ")')
  assert await page.locator('[data-cm=import]').is_disabled()
  assert await page.evaluate('operations.filter(x=>x[0]==="POST").length')==before
  # Folder upload preserves the author and nested path.
  folder=Path('/tmp/content-folder-fixture/新作者');(folder/'短編').mkdir(parents=True,exist_ok=True);(folder/'短編/新作.txt').write_text('新作本文')
  await page.locator('#contentFolderInput').set_input_files(str(folder))
  await page.wait_for_function('!document.querySelector("[data-cm=import]").disabled')
  assert '新作者 / 短編 / 新作' in await page.locator('#contentImportPreview').inner_text()
  await page.locator('[data-cm=import]').click();await page.wait_for_function('rows.length===3')
  assert await page.evaluate('rows.some(b=>b.author==="新作者"&&b.folderPath==="短編")')
  assert not errors,errors
  # Reader author folders do not expose works until expanded.
  await page.evaluate('''async()=>{document.body.innerHTML='<div id="shelf"></div>';const {mountAuthorFolders}=await import('/js/content-folders.js');const list=document.getElementById('shelf');for(const name of ['一','二']){const c=document.createElement('article');c.className='book-card';c.dataset.authorName='作者A';c.dataset.folderPath=name==='一'?'短編':'';c.textContent='作品'+name;list.append(c)}mountAuthorFolders(list)}''')
  assert not await page.locator('.book-card',has_text='作品二').is_visible()
  await page.locator('#shelf > details > summary').click()
  assert await page.locator('.book-card',has_text='作品二').is_visible()
  await page.locator('#shelf > details > details > summary').click()
  assert await page.locator('.book-card',has_text='作品一').is_visible()
  await b.close()
 print('PASS: folder navigation/move; ZIP backup/restore incl. empty folders; duplicate skip; corrupt hash rejected; folder upload; reader author navigation')
asyncio.run(main())
