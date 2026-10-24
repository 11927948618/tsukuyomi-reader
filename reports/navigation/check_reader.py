"""Exercise the real app's main-menu navigation and bookmark restoration."""
import asyncio,json
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(390,844),(800,1280)]:
   page=await browser.new_page(viewport={'width':width,'height':height},has_touch=True,service_workers='block')
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.add_init_script("localStorage.setItem('tsukiyomi:settings:global',JSON.stringify({theme:'dark',writingModePreference:'vertical',displayMode:'paged'}))")
   async def config(route):
    await route.fulfill(json={'mode':'distribution','siteName':'Navigation fixture','allowLocalImport':False,'allowExport':False,'booksManifest':'/fixtures/manifest.json','analyticsEnabled':False})
   await page.route('**/config/site-config.json',config)
   await page.route('**/api/review-auth/status',lambda route:route.fulfill(json={'authRequired':False,'authenticated':True}))
   await page.route('**/fixtures/manifest.json',lambda route:route.fulfill(json=[{'id':'navigation-fixture','title':'戻り確認','format':'txt','path':'/fixtures/navigation.txt','published':True}]))
   await page.route('**/fixtures/navigation.txt',lambda route:route.fulfill(content_type='text/plain; charset=utf-8',body='戻り確認\n\n'+('　川のほとりを歩いていると、遠くに町の灯りが見えた。\n　橋を渡り、もう少し先へ進むことにした。\n\n'*160)))
   async def open_book(resume=False):
    await page.locator('.book-read-button').first.wait_for(state='attached')
    await page.locator('.book-read-button').first.evaluate("e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true}")
    await page.locator('.book-read-button').first.click()
    if resume:await page.get_by_role('button',name='栞から読む',exact=True).click()
    await page.locator('#readerScreen').wait_for()
    await page.locator('.mobile-text-page').first.wait_for();await page.wait_for_timeout(350)
   async def reveal_menu():
    box=await page.locator('#mainMenuBtn').bounding_box()
    if not box or box['y']<0 or await page.locator('body').evaluate("e=>e.classList.contains('chrome-hidden')"):
     await page.touchscreen.tap(width/2,height/2)
    await page.locator('#mainMenuBtn').wait_for()
   await page.goto(URL)
   await open_book()
   # Select a nonzero page through the real reading-position slider.
   await page.locator('#hScroll').evaluate("e=>{e.value=Math.min(10,Number(e.max));e.dispatchEvent(new Event('input',{bubbles:true}))}")
   await page.wait_for_timeout(300)
   start=await page.locator('.mobile-text-page').first.get_attribute('data-source-start')
   assert int(start)>0,start
   await reveal_menu();await page.locator('#mainMenuBtn').click()
   await page.locator('#libraryScreen').wait_for();assert await page.locator('#readerScreen').count()==0
   await open_book(resume=True)
   restored=await page.locator('.mobile-text-page').first.get_attribute('data-source-start')
   assert restored==start,(start,restored)
   # The existing Library button still uses the same navigation.
   await reveal_menu();await page.locator('#backBtn').click()
   await page.locator('#libraryScreen').wait_for()
   assert await page.locator('#readerScreen').count()==0
   assert not errors,errors
   print(f'PASS {width}x{height}: main menu returns to Library; bookmark {start} restored; Library return still works')
   await page.close()
  await browser.close()
try:asyncio.run(main())
finally:server.shutdown()
