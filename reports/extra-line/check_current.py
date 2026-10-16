import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parents[2]
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  results=[]
  for width,height in [(390,844),(800,1280),(1280,800)]:
   page=await b.new_page(viewport={'width':width,'height':height},has_touch=True)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://127.0.0.1:8930/css/base.css')
   await page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/reset.css"><link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/reader.css">'+(root/'templates/reader.html').read_text())
   await page.evaluate(r'''async()=>{
    const {initReader}=await import('/js/reader.js');
    const {normalizeTxtToBook}=await import('/js/normalize-txt.js');
    const text='川の向こうの灯り\n\n'+('　窓を開けると、｜川面《かわも》を渡る風が頬に触れた。遠くの｜橋《はし》には、小さな灯りが並んでいる。\n「もう、帰ろうか」\n　そう言いかけて、私はもう一度だけ空を見た。雲の間に、最初の星が見えていた。\n\n'.repeat(80));
    window.reader=initReader({book:normalizeTxtToBook(text,'paper.txt'),settings:{fontFamilyPreference:'system',writingModePreference:'horizontal',displayMode:'paged',theme:'dark'},onBack(){},onExport(){},onUpdateSettings(s){window.lastSettings=s},onSaveSettings(){},onUpdateProgress(p){window.lastProgress=p}});
    document.querySelector('#paperPresetBtn').click();
    await document.fonts.load('16px "Reader Mincho"');
   }''')
   await page.wait_for_timeout(700)
   data=await page.evaluate('''()=>{const el=document.querySelector('.mobile-text-page'),rect=el.getBoundingClientRect(),view=document.querySelector('#readerViewport'),style=getComputedStyle(view);return {fontReady:document.fonts.check('16px "Reader Mincho"'),font:getComputedStyle(document.querySelector('#bookContent')).fontFamily,writing:getComputedStyle(el).writingMode,paddingTop:parseFloat(style.paddingTop),paddingLeft:parseFloat(style.paddingLeft),border:style.borderTopWidth,shadow:style.boxShadow,columns:el.querySelector('.mobile-text-page-body').textContent.split('\\n').length,pages:document.querySelectorAll('.mobile-text-page').length,ruby:el.querySelectorAll('ruby').length,start:Number(el.dataset.sourceStart),end:Number(el.dataset.sourceEnd),rect:rect.toJSON(),width:innerWidth,height:innerHeight,theme:document.body.classList.contains('theme-light')}}''')
   assert data['fontReady'] and 'Reader Mincho' in data['font'] and data['writing']=='vertical-rl',data
   assert data['border']=='0px' and data['shadow']=='none' and data['theme'],data
   assert data['pages']==1 and data['paddingTop']>=24 and data['paddingLeft']>=18 and data['ruby']>0,data
   assert data['rect']['left']>=0 and data['rect']['right']<=width+1 and data['rect']['bottom']<=height+1,data
   adjustments=[]
   for font in ['mincho','gothic','system']:
    for size in [80,100,140]:
     await page.evaluate("""({font,size})=>{
      const select=document.querySelector('#fontFamilySelect');select.value=font;select.dispatchEvent(new Event('change'));
      const slider=document.querySelector('#fontSizeRange');slider.value=size;slider.dispatchEvent(new Event('input'));
     }""",{'font':font,'size':size})
     await page.wait_for_timeout(200)
     frame=await page.locator('.mobile-text-page').evaluate('(e)=>e.getBoundingClientRect().toJSON()')
     for key in ['x','y','width','height']:assert abs(frame[key]-data['rect'][key])<1,(font,size,key,data['rect'],frame)
     fit=await page.evaluate("""()=>{const page=document.querySelector('.mobile-text-page'),body=page.querySelector('.mobile-text-page-body');return {warning:document.body.classList.contains('pager-fit-warning'),start:Number(page.dataset.sourceStart),end:Number(page.dataset.sourceEnd),font:parseFloat(getComputedStyle(document.querySelector('#bookContent')).fontSize)}}""")
     assert not fit['warning'],(font,size,fit)
     assert abs(fit['font']-16*size/100)<.1,fit
     adjustments.append({'font':font,'size':size,'frame':frame,'text':fit})
   for lineHeight in [1.4,2.4]:
    await page.evaluate("""value=>{const slider=document.querySelector('#lineHeightRange');slider.value=value;slider.dispatchEvent(new Event('input'))}""",lineHeight)
    await page.wait_for_timeout(200)
    frame=await page.locator('.mobile-text-page').evaluate('(e)=>e.getBoundingClientRect().toJSON()')
    for key in ['x','y','width','height']:assert abs(frame[key]-data['rect'][key])<1,(lineHeight,key,frame,data['rect'])
    assert not await page.evaluate("document.body.classList.contains('pager-fit-warning')"),lineHeight
    adjustments.append({'lineHeight':lineHeight,'frame':frame})
   await page.evaluate("document.querySelector('#paperPresetBtn').click()")
   await page.wait_for_timeout(250)
   data['start']=await page.locator('.mobile-text-page').evaluate('(e)=>Number(e.dataset.sourceStart)')
   data['end']=await page.locator('.mobile-text-page').evaluate('(e)=>Number(e.dataset.sourceEnd)')
   await page.touchscreen.tap(width*.1,height*.5)
   await page.wait_for_timeout(400)
   nextStart=await page.locator('.mobile-text-page').evaluate('(e)=>Number(e.dataset.sourceStart)')
   assert nextStart==data['end'],(data,nextStart)
   # no screenshots
   # no screenshots
   assert not errors,errors
   results.append({'viewport':[width,height],**data,'adjustments':adjustments,'nextStart':nextStart})
   await page.close()
  (root/'reports/extra-line/current.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
  print('PASS: paper preset, bundled Mincho, ruby, margins, no frame, fixed frame across three fonts and 80/100/140% sizes, three viewports and next page')
  await b.close()
asyncio.run(main())
