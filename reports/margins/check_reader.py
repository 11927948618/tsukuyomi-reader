import asyncio,json,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parents[2]
async def main():
 results=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for old in [True,False]:
   for w,h in [(390,844),(800,1280),(1280,800)]:
    page=await browser.new_page(viewport={'width':w,'height':h},has_touch=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    if old:
     source=subprocess.check_output(['git','show','47295c8:js/reader.js'],cwd=root,text=True)
     await page.route('**/js/reader.js',lambda route:route.fulfill(body=source,content_type='text/javascript'))
    await page.goto('http://127.0.0.1:8930/css/base.css')
    await page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/reset.css"><link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/reader.css">'+(root/'templates/reader.html').read_text())
    await page.evaluate('''async()=>{
     const {initReader}=await import('/js/reader.js');const {normalizeTxtToBook}=await import('/js/normalize-txt.js');
     window.reader=initReader({book:normalizeTxtToBook('余白の確認\\n\\n'+('窓の向こうに、｜川面《かわも》を渡る風が見えた。'.repeat(500)),'margin.txt'),settings:{fontFamilyPreference:'mincho',spreadView:false,pageColumns:false,writingModePreference:'vertical',displayMode:'paged'},onBack(){},onExport(){},onUpdateSettings(s){window.lastSettings=s},onSaveSettings(){},onUpdateProgress(){}});
     await document.fonts.load('16px "Reader Mincho"');
    }''')
    await page.wait_for_timeout(300)
    for mode in ['vertical']:
     await page.locator('#writingModeSelect').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("change"))}',mode)
     samples=[]
     for position in [0,50,100]:
      await page.locator('#pageMarginRange').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input"))}',position)
      await page.wait_for_timeout(250)
      value=await page.evaluate('''()=>{const e=document.querySelector('.mobile-text-page'),r=e.getBoundingClientRect(),v=document.querySelector('#readerViewport'),s=getComputedStyle(v);return {rect:r.toJSON(),paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,label:document.querySelector('#pageMarginValue').textContent,stored:window.lastSettings.pageMarginPercent,warning:document.body.classList.contains('pager-fit-warning'),font:document.querySelector('#fontFamilySelect').value}}''')
      assert not value['warning'],value
      assert value['font']=='mincho'
      samples.append(value)
     if not old:
      a,c,b=samples
      assert a['rect']['width']>c['rect']['width']>b['rect']['width'],samples
      assert abs(b['rect']['width']/a['rect']['width']-.6)<.02,samples
      for k in ['height','y']:assert abs(a['rect'][k]-b['rect'][k])<1
      assert a['paddingTop']==b['paddingTop'] and a['paddingBottom']==b['paddingBottom']
      assert '左右各20%追加' in b['label']
      assert b['stored']==20
     results.append({'baseline':old,'viewport':[w,h],'mode':mode,'samples':samples})
    await page.locator('#fontFamilySelect').evaluate('(e)=>{e.value="gothic";e.dispatchEvent(new Event("change"))}')
    await page.locator('#pageMarginRange').evaluate('(e)=>{e.value=50;e.dispatchEvent(new Event("input"))}')
    assert await page.locator('#fontFamilySelect').input_value()=='gothic'
    assert await page.evaluate('window.lastSettings.fontFamilyPreference')=='gothic'
    assert not errors,errors
    await page.close()
  await browser.close()
 (root/'reports/margins/checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
 for r in results:
  print('baseline' if r['baseline'] else 'fixed',r['viewport'],r['mode'],[x['rect']['width'] for x in r['samples']])
 print('PASS: margin slider dimensions match labels, top/bottom fixed, Mincho default, no overflow or JS errors')
asyncio.run(main())
