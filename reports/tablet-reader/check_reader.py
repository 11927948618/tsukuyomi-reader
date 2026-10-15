import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parents[2]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1280,'height':800},has_touch=True,is_mobile=True)
  await page.goto('http://127.0.0.1:8930/css/base.css')
  await page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/reset.css"><link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/reader.css">'+(root/'templates/reader.html').read_text())
  await page.evaluate(r"""async()=>{
 const {initReader}=await import('/js/reader.js');
 const {normalizeTxtToBook}=await import('/js/normalize-txt.js');
 const book=normalizeTxtToBook('銀河鉄道の夜\n宮沢賢治\n'+('ジョバンニは窓の外を見ました。川の向こうには星が光っています。\n'.repeat(200)),'sample.txt');
 window.reader=initReader({book,settings:{writingMode:'vertical',displayMode:'paged',spreadView:true},progress:null,onBack(){},onExport(){},onUpdateSettings(){},onSaveSettings(){},onUpdateProgress(){}});
 }""")
  await page.wait_for_timeout(1500)
  results=[]
  for width,height in [(1280,800),(800,1280),(1024,768),(390,844)]:
   await page.set_viewport_size({'width':width,'height':height})
   await page.wait_for_timeout(900)
   data=await page.evaluate("""()=>({spread:document.body.classList.contains('spread-view-enabled'),locked:document.body.classList.contains('rotation-locked'),pages:document.querySelectorAll('.mobile-text-page').length,mainWidth:document.querySelector('.reader-main').getBoundingClientRect().width,viewport:innerWidth})""")
   assert data['spread']==(min(width,height)>640),data
   assert data['locked']==(min(width,height)<=640),data
   assert abs(data['mainWidth']-data['viewport'])<2,data
   assert data['pages']==(2 if data['spread'] else 1),data
   results.append({'size':[width,height],**data})
   await page.screenshot(path=str(root/f'reports/tablet-reader/{width}.png'))
  (root/'reports/tablet-reader/checks.json').write_text(json.dumps(results,indent=2)+'\n')
  print(results)
  await browser.close()
asyncio.run(main())
