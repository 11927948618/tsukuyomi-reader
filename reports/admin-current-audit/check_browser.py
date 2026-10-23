import asyncio,json
from pathlib import Path
from functools import partial
from threading import Thread
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',8952),partial(Handler,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await b.new_page(viewport={'width':1100,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  events=[{'createdAt':'2026-05-29T06:31:00Z','type':'otp-send-failed','result':'failed','reason':'legacy-fixture'}]
  async def api(route):
   path=route.request.url.split('/api/')[-1];data={'ok':True};status=200
   if path=='admin-auth/status':data={'mode':'token','authenticated':False}
   elif path=='admin-auth/token-check':
    if route.request.headers.get('authorization')!='Bearer fixture-valid':status=401;data={'error':'管理トークンが違います'}
    else:
     events.insert(0,{'createdAt':'2026-10-23T04:00:00Z','type':'token-checked','result':'ok','reason':'verified'});data={'ok':True,'authenticated':True,'logged':True}
   elif path=='admin-auth/log':data={'ok':True,'authLog':{'events':events}}
   elif path.startswith('admin/operations/log'):data={'ok':True,'operationLog':{'events':[{'createdAt':'2026-10-23T04:00:01Z','type':'book-created','result':'ok','title':'現在の作品追加','reason':'admin'}]}}
   elif path.startswith('admin/books'):data={'ok':True,'books':[],'folders':[],'scope':'limited'}
   elif path.startswith('admin/review-access'):data={'ok':True,'entries':[],'authLog':{'events':[]}}
   await route.fulfill(status=status,json=data)
  await page.route('**/api/**',api)
  await page.goto('http://127.0.0.1:8952/admin.html');await page.wait_for_timeout(300)
  await page.locator('#adminToken').fill('fixture-wrong');await page.locator('#saveTokenBtn').click();await page.wait_for_timeout(200)
  assert await page.evaluate("localStorage.getItem('tsukuyomi:adminToken')") is None
  await page.locator('#adminToken').fill('fixture-valid');await page.locator('#saveTokenBtn').click();await page.wait_for_timeout(400)
  assert await page.evaluate("localStorage.getItem('tsukuyomi:adminToken')")=='fixture-valid'
  assert not await page.locator('#adminAuthLogBlock').evaluate('(e)=>e.open')
  await page.locator('#adminAuthLogBlock > summary').click()
  assert '管理トークン確認成功' in await page.locator('#adminAuthLog').inner_text()
  assert 'legacy-fixture' not in await page.locator('#adminAuthLog').inner_text()
  assert not await page.locator('#adminLegacyAuthBlock').evaluate('(e)=>e.open')
  await page.locator('#adminLegacyAuthBlock > summary').click()
  assert 'legacy-fixture' in await page.locator('#adminLegacyAuthLog').inner_text()
  await page.locator('#adminOperationLogBlock > summary').click();await page.wait_for_timeout(250)
  assert '現在の作品追加' in await page.locator('#adminOperationLog').inner_text()
  async with page.expect_download() as download:
   await page.locator('#downloadAdminOperationLogBtn').click()
  assert (await download.value).suggested_filename.startswith('tsukuyomi-operations-limited-')
  await page.locator('#clearTokenBtn').click()
  assert not await page.locator('#adminOperationLogBlock').is_visible()
  assert not await page.locator('#adminAuthLogBlock').is_visible()
  assert not errors,errors
  await b.close()
 print('PASS: invalid token not saved, verified token saved/logged, legacy separated, operations visible/downloadable, logout hides history')
asyncio.run(main());server.shutdown()
