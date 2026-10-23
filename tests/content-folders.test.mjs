import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFolderPath} from '../js/content-folders.js';
import {locationFromFile} from '../js/content-manager.js';
import {readCatalog,writeCatalog,toPublicManifestEntry,MANIFEST_KEY} from '../functions/_shared/books.js';
import {onRequestPost as folders} from '../functions/api/admin/folders/index.js';
import {onRequestPost as upload} from '../functions/api/admin/books/index.js';
import {onRequestPatch as patchBook} from '../functions/api/admin/books/[id].js';
import {onRequestGet as download} from '../functions/api/admin/books/[id]/file.js';
function bucket(initial){const records=new Map(Object.entries(initial));return {records,async get(key){if(!records.has(key))return null;const value=records.get(key);return {async text(){return value},body:value,httpMetadata:{contentType:'text/plain'}}},async put(key,value){records.set(key,value)}}}
const initial={books:[{id:'book-1',author:'宮沢賢治',folderPath:'短編/初期',contentKey:'immutable/book.txt',title:'作品',published:false}],folders:[{author:'宮沢賢治',path:'短編/空'}]};
test('paths and author/file inference preserve Unicode and reject traversal',()=>{
 assert.equal(normalizeFolderPath('短編\\初期'),'短編/初期');
 for(const p of ['../x','a/../b','/absolute','C:/x','a/./b','a\u0000b'])assert.throws(()=>normalizeFolderPath(p));
 assert.deepEqual(locationFromFile('宮沢賢治/短編/銀河.txt'),{author:'宮沢賢治',folderPath:'短編',title:'銀河',filename:'銀河.txt'});
});
test('folder metadata survives normal book catalog writes',async()=>{
 const b=bucket({[MANIFEST_KEY]:JSON.stringify(initial)});await writeCatalog(b,{books:initial.books});const c=await readCatalog(b);assert.deepEqual(c.folders,initial.folders);assert.equal(toPublicManifestEntry(c.books[0]).folderPath,'短編/初期');
});
test('authenticated subtree move keeps IDs/storage keys and empty folders',async()=>{
 const b=bucket({[MANIFEST_KEY]:JSON.stringify(initial)}),env={BOOKS_BUCKET:b,ADMIN_TOKEN:'unit-test-token'};
 const request=new Request('https://example.test/api/admin/folders',{method:'POST',headers:{authorization:'Bearer unit-test-token','content-type':'application/json'},body:JSON.stringify({action:'move',fromAuthor:'宮沢賢治',fromPath:'短編',author:'宮沢賢治',path:'作品集'})});
 const response=await folders({request,env});assert.equal(response.status,200);const c=await readCatalog(b);assert.equal(c.books[0].id,'book-1');assert.equal(c.books[0].contentKey,'immutable/book.txt');assert.equal(c.books[0].folderPath,'作品集/初期');assert.ok(c.folders.some(f=>f.path==='作品集/空'));
});
test('private backup file needs admin; path is taken from catalog, not request',async()=>{
 const b=bucket({[MANIFEST_KEY]:JSON.stringify(initial),'immutable/book.txt':'private-content'}),env={BOOKS_BUCKET:b,ADMIN_TOKEN:'unit-test-token'};
 assert.equal((await download({request:new Request('https://example.test/file'),env,params:{id:'book-1'}})).status,401);
 const response=await download({request:new Request('https://example.test/file?key=other-secret',{headers:{authorization:'Bearer unit-test-token'}}),env,params:{id:'book-1'}});assert.equal(response.status,200);assert.equal(await response.text(),'private-content');assert.equal(response.headers.get('cache-control'),'no-store');
});

test('create-only import refuses existing IDs without touching original bytes',async()=>{
 const b=bucket({[MANIFEST_KEY]:JSON.stringify(initial),'immutable/book.txt':'original'}),env={BOOKS_BUCKET:b,ADMIN_TOKEN:'unit-test-token'};
 const form=new FormData();form.set('id','book-1');form.set('title','置換しない');form.set('createOnly','true');
 const response=await upload({request:new Request('https://example.test/api/admin/books',{method:'POST',headers:{authorization:'Bearer unit-test-token'},body:form}),env});
 assert.equal(response.status,409);assert.equal(b.records.get('immutable/book.txt'),'original');assert.equal((await readCatalog(b)).books[0].title,'作品');
});
test('book move updates metadata without moving files or dropping empty folders',async()=>{
 const b=bucket({[MANIFEST_KEY]:JSON.stringify(initial)}),env={BOOKS_BUCKET:b,ADMIN_TOKEN:'unit-test-token'};
 const response=await patchBook({request:new Request('https://example.test/api/admin/books/book-1',{method:'PATCH',headers:{authorization:'Bearer unit-test-token','content-type':'application/json'},body:JSON.stringify({author:'別作者',folderPath:'作品集'})}),env,params:{id:'book-1'}});
 assert.equal(response.status,200);const c=await readCatalog(b);assert.equal(c.books[0].author,'別作者');assert.equal(c.books[0].contentKey,'immutable/book.txt');assert.deepEqual(c.folders,initial.folders);
});
