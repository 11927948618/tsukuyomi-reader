import asyncio,json
from pathlib import Path
from functools import partial
from threading import Thread
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',8951),partial(Handler,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
INIT='''async ({settings,progress,short=false,format='txt'})=>{
 window.reader?.destroy();document.body.className='';
 document.body.innerHTML='<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/reset.css"><link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/reader.css">'+await(await fetch('/templates/reader.html')).text();
 const {initReader}=await import('/js/reader.js');
 const prose='　窓を開けると、川面を渡る風が頬に触れた。遠くの橋には、小さな灯りが並んでいる。';
 const html=short?'<section class="chapter" id="c1"><p>短い作品です。</p></section>':Array.from({length:3},(_,i)=>`<section class="chapter" id="c${i+1}">${Array.from({length:45},()=>`<p>${prose}</p><p>「もう、帰ろうか」そう言いかけて、私は空を見た。</p>`).join('')}</section>`).join('');
 window.lastSettings=settings;window.lastProgress=progress;
 window.reader=initReader({book:{title:'見開き検証',html,meta:{format},toc:[1,2,3].map(n=>({chapterId:'c'+n,title:'第'+n+'章'}))},settings:{fontSize:100,lineHeight:1.8,fontFamilyPreference:'mincho',writingModePreference:'vertical',displayMode:'paged',pageTurnEffect:'slide',...settings},progress,onBack(){},onExport(){},onUpdateSettings(s){window.lastSettings=s},onSaveSettings(){},onUpdateProgress(p){window.lastProgress=p}});
 await document.fonts.load('16px "Reader Mincho"');
}'''
STATE='''()=>({pages:Array.from(document.querySelectorAll('.mobile-text-page')).map(p=>({index:+p.dataset.pageIndex,start:+p.dataset.sourceStart,end:+p.dataset.sourceEnd,chapter:p.dataset.chapterId,blank:p.classList.contains('blank-page'),rect:p.getBoundingClientRect().toJSON()})),group:document.querySelector('.mobile-text-spread')?.className,info:document.querySelector('#hScrollPageInfo').textContent,progress:window.lastProgress,settings:window.lastSettings,warning:document.body.classList.contains('pager-fit-warning'),status:document.querySelector('#pageGroupStatus').textContent,dimensions:{visualHeight:visualViewport.height,root:getComputedStyle(document.documentElement).getPropertyValue('--reader-viewport-height'),topbar:getComputedStyle(document.documentElement).getPropertyValue('--reader-topbar-height'),main:document.querySelector('.reader-main').getBoundingClientRect().toJSON(),viewport:document.querySelector('#readerViewport').getBoundingClientRect().toJSON()}})'''
async def main():
 results=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  async def create(w,h,settings={},progress=None,short=False,format='txt'):
   page=await browser.new_page(viewport={'width':w,'height':h});errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
   await page.goto('http://127.0.0.1:8951/css/base.css');await page.evaluate(INIT,dict(settings=settings,progress=progress,short=short,format=format));await page.wait_for_timeout(450)
   assert not errs,errs
   return page,errs
  async def click(page,sel):
   await page.locator(sel).evaluate('(e)=>e.click()');await page.wait_for_timeout(250)
  async def inputval(page,sel,value):
   await page.locator(sel).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input"))}',value);await page.wait_for_timeout(250)
  async def state(page):return await page.evaluate(STATE)
  for w,h in [(800,1280),(1280,800),(1024,768)]:
   for mode in ['vertical','horizontal']:
    for arrangement in ['columns','rows']:
     settings=dict(writingModePreference=mode,spreadView=arrangement=='columns',stackedView=arrangement=='rows')
     page,errs=await create(w,h,settings)
     s=await state(page);assert s['group'] and len(s['pages'])==2,(w,h,mode,arrangement,s)
     a,b=s['pages'];assert a['index']==0 and b['index']==1
     assert (a['rect']['x']>b['rect']['x'] if mode=='vertical' else a['rect']['x']<b['rect']['x']) if arrangement=='columns' else a['rect']['y']<b['rect']['y'],s
     assert not s['warning'],(w,h,mode,arrangement,s)
     if w==800: await page.screenshot(path=f'/tmp/two-page-{mode}-{arrangement}.png')
     await page.locator('#tapZone').dispatch_event('wheel',{'deltaY':100});await page.wait_for_timeout(50)
     assert await page.evaluate("document.body.classList.contains('page-turn-slide')")
     await page.wait_for_timeout(300);s=await state(page);assert s['pages'][0]['index']==2,s
     # Save a first-face source locator and reopen with changed font/layout.
     saved=s['progress'];assert saved['sourceLocator']['sourceOffset']==s['pages'][0]['start']
     restoredSettings={**settings,'fontSize':120,'spreadView':arrangement=='rows','stackedView':arrangement=='columns'}
     await page.evaluate(INIT,dict(settings=restoredSettings,progress=saved));await page.wait_for_timeout(500)
     restored=await state(page);locator=saved['sourceLocator'];assert any(not v['blank'] and v['chapter']==locator['chapterId'] and v['start']<=locator['sourceOffset']<=v['end'] for v in restored['pages']),(saved,restored)
     # Jump to chapter 3, then last group; progress reaches 100%.
     await click(page,'#tocList li:last-child button');s=await state(page);assert any(v['chapter']=='c3' for v in s['pages']),s
     await inputval(page,'#hScroll',await page.locator('#hScroll').get_attribute('max'));s=await state(page);assert s['progress']['progressPercent']==100,s
     assert s['pages'][0]['index']%2==0
     # A small viewport falls back, remembers preference and returns to two faces.
     await page.set_viewport_size({'width':390,'height':500});await page.wait_for_timeout(500)
     small=await state(page);assert len(small['pages'])==1 and '広さ' in small['status'],small
     await page.set_viewport_size({'width':w,'height':h});await page.wait_for_timeout(500)
     recovered=await state(page);assert len(recovered['pages'])==2,(w,h,mode,arrangement,recovered)
     assert not errs,errs
     results.append(dict(width=w,height=h,mode=mode,arrangement=arrangement,passed=True));await page.close()
  # Short/odd book must keep its first face in the same grid cell and append a blank.
  for mode in ['vertical','horizontal']:
   for arrangement in ['columns','rows']:
    page,errs=await create(800,1280,dict(writingModePreference=mode,spreadView=arrangement=='columns',stackedView=arrangement=='rows'),short=True,format='epub')
    s=await state(page);assert len(s['pages'])==2 and s['pages'][1]['blank'],s
    assert s['progress']['progressPercent']==100
    # Unified controls: off retains arrangement, on restores it.
    await click(page,'#twoPageViewCheck');assert len((await state(page))['pages'])==1
    await click(page,'#twoPageViewCheck');assert len((await state(page))['pages'])==2
    assert await page.locator(f'input[name=pageArrangement][value={arrangement}]').is_checked()
    await page.close()
  for w,h,arrangement in [(844,390,'columns'),(390,900,'rows')]:
   for mode in ['vertical','horizontal']:
    page,errs=await create(w,h,dict(writingModePreference=mode,spreadView=arrangement=='columns',stackedView=arrangement=='rows'),format='html')
    s=await state(page);assert len(s['pages'])==2 and not s['warning'],(w,h,mode,s)
    # Finger-edge tap advances exactly one group, with the writing direction.
    rect=await page.locator('#tapZone').bounding_box()
    x=rect['x']+rect['width']*(0.08 if mode=='vertical' else 0.92);y=rect['y']+rect['height']*0.5
    for event in ['pointerdown','pointerup']:
     await page.locator('#tapZone').dispatch_event(event,dict(pointerId=7,pointerType='touch',clientX=x,clientY=y,button=0))
    await page.wait_for_timeout(350)
    assert (await state(page))['pages'][0]['index']==2,(w,h,mode,await state(page))
    if mode=='vertical':
     await click(page,'#addVerticalColumnBtn')
     assert await page.locator('#addVerticalColumnBtn').is_checked()
     await inputval(page,'#lineHeightRange',1.9)
     assert await page.locator('#addVerticalColumnBtn').is_checked()
     await click(page,'#addVerticalColumnBtn');assert await page.locator('#lineHeightRange').input_value()=='1.9'
    await page.locator('input[name=displayMode][value=scroll]').evaluate('(e)=>e.click()');await page.wait_for_timeout(250)
    assert await page.locator('#twoPageViewCheck').is_disabled()
    await page.locator('input[name=displayMode][value=paged]').evaluate('(e)=>e.click()');await page.wait_for_timeout(250)
    assert len((await state(page))['pages'])==2
    assert not errs,errs
    results.append(dict(width=w,height=h,mode=mode,arrangement=arrangement,touch=True,passed=True));await page.close()
  await browser.close()
 (ROOT/'reports/two-page/checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
 print('PASS: 12 tablet/desktop + 4 phone cases; source bookmark, chapter jump, grouped turn, last group, fallback/recovery; 4 short EPUB cases; touch, fine adjustment and scroll switching')
asyncio.run(main());server.shutdown()
