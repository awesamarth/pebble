import {chooseLocalFolder,FolderPickerError,isFolderPickerRequest} from '../../../../runtime/folder-picker';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!isFolderPickerRequest(request))return Response.json({error:'Open the folder picker from pebble.'},{status:403});
 try{return Response.json(await chooseLocalFolder(request.signal),{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof FolderPickerError?error.message:'The folder picker couldn’t finish. Try again.'},{status:error instanceof FolderPickerError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
