import {requireAdmin,resolveAdminBooksBucket,readCatalog,error} from '../../../../_shared/books.js';
export async function onRequestGet({request,env,params}){
 const auth=await requireAdmin(request,env);if(!auth.ok)return auth.response;
 const url=new URL(request.url),target=resolveAdminBooksBucket(env,url.searchParams.get('scope'));if(!target.bucket)return error(target.missingMessage,500);
 const book=(await readCatalog(target.bucket)).books.find(b=>b.id===params.id);if(!book)return error('作品が見つかりません',404);
 const key=url.searchParams.get('kind')==='cover'?book.coverKey:book.contentKey;if(!key)return error('ファイルがありません',404);
 const obj=await target.bucket.get(key);if(!obj)return error('ファイルがありません',404);
 return new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
