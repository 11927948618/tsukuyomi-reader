import {adminOperationActor,recordAdminOperationEvent} from '../../../_shared/admin-operation-log.js';
import {requireAdmin,resolveAdminBooksBucket,readCatalog,writeCatalog,json,error} from '../../../_shared/books.js';
import {normalizeFolderPath} from '../../../../js/content-folders.js';
export async function onRequestPost({request,env}){
 const auth=await requireAdmin(request,env);if(!auth.ok)return auth.response;
 const target=resolveAdminBooksBucket(env,new URL(request.url).searchParams.get('scope'));if(!target.bucket)return error(target.missingMessage,500);
 const body=await request.json().catch(()=>null);if(!body||!['create','move'].includes(body.action))return error('操作を指定してください');
 let from,to;try{from=normalizeFolderPath(body.fromPath||'');to=normalizeFolderPath(body.path||'')}catch(e){return error(e.message)}
 const author=String(body.author||'').trim();if(!author||author.length>200)return error('作者名を確認してください');
 const fromAuthor=String(body.fromAuthor||'').trim();
 if(body.action==='move'&&fromAuthor===author&&from&&to.startsWith(from+'/'))return error('フォルダ自身の中には移動できません');
 const catalog=await readCatalog(target.bucket),folders=catalog.folders||[];
 const matches=b=>((b.author||'').trim()||'作者未設定')===fromAuthor&&(!from||(b.folderPath||'')===from||(b.folderPath||'').startsWith(from+'/'));
 const relocate=b=>({...b,author,folderPath:[to,(b.folderPath||'').slice(from?from.length:0).replace(/^\//,'')].filter(Boolean).join('/')});
 let changed=0;
 if(body.action==='move'){
  if(!fromAuthor)return error('移動元の作者が必要です');
  catalog.books=catalog.books.map(b=>{if(!matches(b))return b;changed++;return relocate(b)});
  catalog.folders=folders.map(f=>{const book={author:f.author,folderPath:f.path};return matches(book)?{author,path:relocate(book).folderPath}:f});
 }else catalog.folders=folders;
 if(!catalog.folders.some(f=>f.author===author&&f.path===to))catalog.folders.push({author,path:to});
 await writeCatalog(target.bucket,catalog);
 await recordAdminOperationEvent(target.bucket,{type:'content-folder-'+body.action,result:'ok',actor:adminOperationActor(auth),reason:'admin',details:{changed,fromAuthor,fromPath:from,author,path:to}});return json({ok:true,changed});
}
