import asyncio,json
from pathlib import Path
from functools import partial
from threading import Thread
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',8940),partial(Handler,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
async def main():
 results=[]
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for w,h in [(320,640),(390,844),(800,1280),(1280,800)]:
   page=await b.new_page(viewport={'width':w,'height':h});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://127.0.0.1:8940/css/base.css')
   await page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/reset.css"><link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/reader.css">'+(ROOT/'templates/reader.html').read_text())
   await page.evaluate('''async()=>{const {initReader}=await import('/js/reader.js');const {normalizeTxtToBook}=await import('/js/normalize-txt.js');window.reader=initReader({book:normalizeTxtToBook('余白の確認\\n\\n'+('　窓を開けると、｜川面《かわも》を渡る風が頬に触れた。遠くの｜橋《はし》には、小さな灯りが並んでいる。\\n「もう、帰ろうか」\\n　そう言いかけて、私はもう一度だけ空を見た。雲の間に、最初の星が見えていた。\\n\\n'.repeat(80)),'test.txt'),settings:{fontSize:100,lineHeight:1.8,fontFamilyPreference:'mincho',writingModePreference:'vertical',displayMode:'paged'},onBack(){},onExport(){},onUpdateSettings(s){window.lastSettings=s},onSaveSettings(){},onUpdateProgress(p){window.lastProgress=p}});await document.fonts.load('16px "Reader Mincho"')}''')
   await page.wait_for_timeout(250)
   async def setval(id,value):
    await page.locator('#'+id).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input"))}',value);await page.wait_for_timeout(220)
   async def metrics():
    return await page.evaluate('''()=>({rect:document.querySelector('.mobile-text-page').getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(document.querySelector('#bookContent')).fontSize),top:parseFloat(getComputedStyle(document.querySelector('#readerViewport')).paddingTop),label:document.querySelector('#pageMarginValue').textContent,warning:document.body.classList.contains('pager-fit-warning'),bodySize:[document.querySelector('.mobile-text-page-body').scrollWidth,document.querySelector('.mobile-text-page-body').clientWidth,document.querySelector('.mobile-text-page-body').scrollHeight,document.querySelector('.mobile-text-page-body').clientHeight],line:getComputedStyle(document.querySelector('#bookContent')).lineHeight})''')
   before=await metrics();await setval('pageVerticalMarginRange',14);after=await metrics()
   assert after['top']>before['top'] and after['rect']['height']<before['rect']['height'],(before,after)
   assert abs(before['rect']['width']-after['rect']['width'])<1
   assert await page.evaluate('lastSettings.pageVerticalMarginPercent')==14
   await setval('pageVerticalMarginRange',7);b1=await metrics();await setval('pageMarginRange',100);b2=await metrics()
   assert b2['rect']['width']<b1['rect']['width'] and abs(b2['top']-b1['top'])<1,(w,h,b1,b2)
   await setval('pageMarginRange',50)
   base=await metrics();await page.locator('#addVerticalColumnBtn').evaluate('(e)=>e.click()');await page.wait_for_timeout(220);extra=await metrics()
   assert await page.evaluate('lastSettings.lineHeight')<1.8
   assert int(extra['label'].split('×')[-1].split('列')[0])>=int(base['label'].split('×')[-1].split('列')[0])+1
   assert extra['font']==base['font'];assert abs(extra['rect']['width']-base['rect']['width'])<1
   assert not extra['warning'],(base,extra)
   assert await page.locator('#lineHeightRange').input_value()=='1.8'
   await setval('lineHeightRange',1.9)
   assert await page.locator('#addVerticalColumnBtn').is_checked()
   await page.locator('#addVerticalColumnBtn').evaluate('(e)=>e.click()')
   assert await page.evaluate('lastSettings.lineHeight')==1.9
   await setval('lineHeightRange',1.8)
   if w>=800:
    for layout in ['spreadViewCheck','stackedViewCheck']:
     await page.locator('#'+layout).evaluate('(e)=>e.click()');await page.wait_for_timeout(220)
     single=await metrics()
     await page.locator('#addVerticalColumnBtn').evaluate('(e)=>e.click()');await page.wait_for_timeout(220)
     refined=await metrics()
     assert int(refined['label'].split('×')[-1].split('列')[0])>=int(single['label'].split('×')[-1].split('列')[0])+1,(layout,single,refined)
     await page.locator('#addVerticalColumnBtn').evaluate('(e)=>e.click()')
     assert await page.evaluate('lastSettings.lineHeight')==1.8
     await page.locator('#'+layout).evaluate('(e)=>e.click()')
   await page.locator('#addVerticalColumnBtn').evaluate('(e)=>e.click()')

   await setval('fontSizeRange',240);large=await metrics()
   assert abs(large['font']-38.4)<.1,large
   assert not large['warning'],large
   await page.locator('#writingModeSelect').evaluate("e=>{e.value='horizontal';e.dispatchEvent(new Event('change'))}")
   await page.wait_for_timeout(220)
   horizontal=await metrics();assert not horizontal['warning'],horizontal
   assert await page.locator('#addVerticalColumnBtn').is_checked()
   await page.locator('#addVerticalColumnBtn').evaluate('(e)=>e.click()')
   assert not await page.locator('#addVerticalColumnBtn').is_checked()
   assert await page.locator('#addVerticalColumnBtn').is_disabled()
   assert await page.locator('#pageMarginHint').count()==0
   assert not errors,errors
   results.append({'viewport':[w,h],'before':before,'vertical':after,'extra_column':extra,'large':large})
   await page.close()
  await b.close()
 Path(__file__).with_name('checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 print('PASS: independent axes, saved setting, column action and 240% text at phone/tablet/desktop sizes')
asyncio.run(main())
