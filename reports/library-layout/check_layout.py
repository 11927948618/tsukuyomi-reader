import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parents[2]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await browser.new_page()
  await page.goto('http://127.0.0.1:8930/css/base.css')
  await page.set_content('<link rel="stylesheet" href="http://127.0.0.1:8930/css/reset.css"><link rel="stylesheet" href="http://127.0.0.1:8930/css/base.css"><link rel="stylesheet" href="http://127.0.0.1:8930/css/reader.css">'+(root/'templates/library.html').read_text())
  await page.evaluate('''async()=>{
 document.body.className='site-mode-distribution';
 document.querySelectorAll('[data-manual-import],[data-export-control]').forEach(e=>e.hidden=true);
 document.querySelector('#bundledBooksList').hidden=false;
 document.querySelector('#bundledBooksTools').hidden=false;
 document.querySelector('#librarySiteName').textContent='TsukuyomiReader 立ち読み用';
 document.querySelector('#versionBadge').textContent='v0.1.245';
 document.querySelector('#bundledBooksStatus').textContent='4コンテンツ';
 const {mountLearningApp}=await import('/js/learning-apps.js');
 const list=document.querySelector('#bundledBooksList');
 for(const title of ['銀河鉄道の夜','レーニンフィールド商会 第１部「あなたの行方」','セロ弾きのゴーシュ']){
 mountLearningApp(list,{title,url:'/apps/wanwan/',version:'0.4.6'});
 const info=list.lastElementChild.querySelector('.book-info');
 info.querySelector('.book-author').textContent='宮沢賢治・EPUB作品';
 info.querySelector('.book-description').textContent='約38,473字 / 400字換算 約97枚 更新日 2026-05-15';
 }
 mountLearningApp(list,{title:'わんわん地図帳 ベータ版',url:'/apps/wanwan/',version:'0.4.6',description:'立体地図で日本の地形を学ぶ'});
}''')
  results=[]
  for width,height in [(1280,800),(960,600),(800,1280),(390,844)]:
   await page.set_viewport_size({'width':width,'height':height})
   await page.wait_for_timeout(150)
   data=await page.evaluate('''()=>{const cols=[...document.querySelectorAll('.library-column')].map(e=>e.getBoundingClientRect());const cards=[...document.querySelectorAll('.book-card')].map(e=>e.getBoundingClientRect());return {ratio:cols[1].width/cols[0].width,sameRow:Math.abs(cards[0].top-cards[1].top)<1,overflow:document.querySelector('#libraryScreen').scrollWidth>innerWidth,buttonOverflow:[...document.querySelectorAll('.book-read-button')].some(e=>e.getBoundingClientRect().right>e.closest('.book-card').getBoundingClientRect().right)}}''')
   assert not data['overflow'] and not data['buttonOverflow'],data
   assert data['sameRow']==(width>=900),data
   if width>=900: assert abs(data['ratio']-2)<.02,data
   results.append({'viewport':[width,height],**data})
   await page.screenshot(path=str(root/f'reports/library-layout/{width}.png'))
  (root/'reports/library-layout/checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps(results))
  await browser.close()
asyncio.run(main())
