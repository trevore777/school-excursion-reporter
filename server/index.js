import 'dotenv/config';
import express from'express';import session from'express-session';import multer from'multer';import sharp from'sharp';
import{generateReport}from'./services/ai.js';import{transcribeAudio}from'./services/transcription.js';import{makePdf}from'./services/pdf.js';import{ensureFolder,upload}from'./services/graph.js';import{loginUrl,redeem}from'./services/auth.js';
const app=express();
const photosUp=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:12}});
const audioUp=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1}});
app.use(express.json({limit:'1mb'}));
app.use(session({secret:process.env.SESSION_SECRET||'dev-only-change-me',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'}}));

const microsoftConfigured=()=>Boolean(process.env.MICROSOFT_TENANT_ID&&process.env.MICROSOFT_CLIENT_ID&&process.env.MICROSOFT_CLIENT_SECRET&&process.env.MICROSOFT_REDIRECT_URI);
const sharePointConfigured=()=>Boolean(microsoftConfigured()&&process.env.SHAREPOINT_DRIVE_ID);
app.get('/api/status',(req,res)=>res.json({aiConfigured:Boolean(process.env.OPENAI_API_KEY),microsoftConfigured:microsoftConfigured(),sharePointConfigured:sharePointConfigured(),signedIn:Boolean(req.session.graphToken),user:req.session.user||null}));
app.get('/api/auth/login',async(req,res)=>{try{res.redirect(await loginUrl())}catch(e){res.status(503).send(e.message)}});
app.get('/api/auth/callback',async(req,res)=>{try{const a=await redeem(req.query.code);req.session.graphToken=a.accessToken;req.session.user=a.account?.username;res.redirect('http://localhost:5173')}catch(e){res.status(500).send(e.message)}});
app.get('/api/auth/logout',(req,res)=>req.session.destroy(()=>res.redirect('http://localhost:5173')));
app.post('/api/notes/transcribe',audioUp.single('audio'),async(req,res)=>{try{if(!req.file)throw new Error('No audio was received.');res.json({text:await transcribeAudio(req.file.buffer,req.file.mimetype)})}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/reports/generate',async(req,res)=>{try{res.json(await generateReport(req.body))}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/sharepoint/save',photosUp.array('photos',12),async(req,res)=>{try{
  if(!sharePointConfigured())return res.status(503).json({error:'SharePoint connection is pending IT configuration.'});
  if(!req.session.graphToken)return res.status(401).json({error:'Sign in with Microsoft first.'});
  const r=JSON.parse(req.body.report);const safeName=(r.excursionName||'Excursion').replace(/[^a-z0-9 _-]/gi,'').trim()||'Excursion';const date=r.excursionDate||new Date().toISOString().slice(0,10);const year=(date.match(/^\d{4}/)||[String(new Date().getFullYear())])[0];const folder=`${process.env.SHAREPOINT_ROOT_FOLDER||'School Excursion Reports'}/${year}/${date} - ${safeName}`;const parent=await ensureFolder(req.session.graphToken,process.env.SHAREPOINT_DRIVE_ID,folder);const files=[];
  const pdf=await makePdf(r);files.push(await upload(req.session.graphToken,process.env.SHAREPOINT_DRIVE_ID,parent,`${date}_${safeName}_Excursion-Report.pdf`,pdf,'application/pdf'));
  let n=1;for(const f of req.files||[]){const img=await sharp(f.buffer).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();files.push(await upload(req.session.graphToken,process.env.SHAREPOINT_DRIVE_ID,parent,`${date}_${safeName}_Photo-${String(n++).padStart(2,'0')}.jpg`,img,'image/jpeg'))}
  res.json({ok:true,files:files.map(x=>({id:x.id,name:x.name,webUrl:x.webUrl}))});
}catch(e){res.status(500).json({error:e.message})}});
if(process.env.NODE_ENV==='production'){app.use(express.static('dist'));app.get('*',(req,res)=>res.sendFile(process.cwd()+'/dist/index.html'))}
app.listen(process.env.PORT||3000,()=>console.log(`Excursion Report V1 on http://localhost:${process.env.PORT||3000}`));
