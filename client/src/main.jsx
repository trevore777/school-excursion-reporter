import React,{useEffect,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import'./style.css';

const today=()=>new Date().toISOString().slice(0,10);
const fresh=()=>({
  reportType:'Excursion Report',
  excursionName:'',venue:'',excursionDate:today(),yearLevels:'',subject:'Digital Technologies',staff:'',notes:''
});

function isMobileLike(){
  if(typeof navigator==='undefined')return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}

function App(){
  const[data,setData]=useState(fresh),[photos,setPhotos]=useState([]),[report,setReport]=useState(null),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
  const[status,setStatus]=useState({aiConfigured:false,microsoftConfigured:false,sharePointConfigured:false});
  const[recording,setRecording]=useState(false),[transcribing,setTranscribing]=useState(false);
  const recorderRef=useRef(null),streamRef=useRef(null),chunksRef=useRef([]),photosRef=useRef([]);
  const mobile=isMobileLike();
  const secure=window.isSecureContext;
  const set=(k,v)=>setData(d=>({...d,[k]:v}));

  useEffect(()=>{
    fetch('/api/status').then(r=>r.json()).then(setStatus).catch(()=>{});
    return()=>photosRef.current.forEach(p=>URL.revokeObjectURL(p.url));
  },[]);
  useEffect(()=>{photosRef.current=photos},[photos]);

  async function parseResponse(r,label){
    const text=await r.text();
    if(!text)throw new Error(`${label} returned an empty response (${r.status}).`);
    let j;try{j=JSON.parse(text)}catch{throw new Error(`${label} returned non-JSON (${r.status}): ${text.slice(0,300)}`)}
    if(!r.ok)throw new Error(j.error||`${label} failed (${r.status}).`);return j;
  }

  function addFiles(files){
    const selected=[...files].filter(f=>f.type.startsWith('image/'));
    if(!selected.length)return;
    const next=selected.map(file=>({id:crypto.randomUUID(),file,url:URL.createObjectURL(file),caption:''}));
    setPhotos(current=>{
      const combined=[...current,...next];
      const kept=combined.slice(0,12);
      combined.slice(12).forEach(p=>URL.revokeObjectURL(p.url));
      return kept;
    });
  }
  function removePhoto(id){setPhotos(p=>p.filter(x=>{if(x.id===id){URL.revokeObjectURL(x.url);return false}return true}))}
  function caption(id,value){setPhotos(p=>p.map(x=>x.id===id?{...x,caption:value}:x))}

  async function startRecording(){
    setMsg('');
    try{
      if(!secure)throw new Error('Voice notes need a secure HTTPS connection on phones and tablets.');
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone recording is not supported in this browser.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;chunksRef.current=[];
      const rec=new MediaRecorder(stream);recorderRef.current=rec;
      rec.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};
      rec.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());streamRef.current=null;setRecording(false);
        const blob=new Blob(chunksRef.current,{type:rec.mimeType||'audio/webm'});chunksRef.current=[];
        await transcribe(blob);
      };
      rec.start();setRecording(true);
    }catch(e){setMsg(e.message);setRecording(false)}
  }
  function stopRecording(){if(recorderRef.current?.state==='recording')recorderRef.current.stop()}
  async function transcribe(blob){
    setTranscribing(true);setMsg('');
    try{
      const fd=new FormData();fd.append('audio',blob,'excursion-note.webm');
      const r=await fetch('/api/notes/transcribe',{method:'POST',body:fd});const j=await parseResponse(r,'Voice transcription');
      setData(d=>({...d,notes:[d.notes,j.text].filter(Boolean).join(d.notes?'\n':'').trim()}));
    }catch(e){setMsg(e.message)}finally{setTranscribing(false)}
  }

  async function generate(){
    setBusy(true);setMsg('');
    try{
      const r=await fetch('/api/reports/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      setReport(await parseResponse(r,'AI report generation'));
      requestAnimationFrame(()=>document.querySelector('.report')?.scrollIntoView({behavior:'smooth',block:'start'}));
    }catch(e){setMsg(e.message)}finally{setBusy(false)}
  }

  async function save(){
    if(!status.sharePointConfigured){setMsg('SharePoint connection is pending IT setup. You can still generate and review the report.');return}
    setBusy(true);setMsg('');
    try{
      const fd=new FormData();fd.append('report',JSON.stringify({...data,...report,photoCaptions:photos.map((p,i)=>({number:i+1,caption:p.caption}))}));
      photos.forEach(p=>fd.append('photos',p.file));
      const r=await fetch('/api/sharepoint/save',{method:'POST',body:fd});const j=await parseResponse(r,'SharePoint save');
      photos.forEach(p=>URL.revokeObjectURL(p.url));setPhotos([]);setData(fresh());setReport(null);setMsg(`Saved ${j.files?.length||0} file(s) to SharePoint.`);
    }catch(e){setMsg(e.message)}finally{setBusy(false)}
  }

  return <main>
    <header>
      <div><small>SCHOOL EXCURSION REPORTER</small><h1>Capture the day.<br/>Build the report.</h1><p>Take photos, add quick captions and dictate or type notes during an excursion. AI prepares an editable school report for review.</p></div>
      {status.microsoftConfigured?<a className="signin" href="/api/auth/login">Microsoft sign-in</a>:<button className="signin pending" disabled>SharePoint pending</button>}
    </header>

    {!status.sharePointConfigured&&<div className="setupBanner"><strong>Development mode:</strong> Microsoft/SharePoint access is waiting on school IT approval. Camera, photos, captions, voice notes and AI reporting can be tested now.</div>}

    <div className={`deviceBanner ${secure?'ready':'warning'}`}>
      <div><strong>{mobile?'Mobile capture mode':'Desktop test mode'}</strong><span>{mobile?'“Take Photo” requests the phone/tablet rear camera.':'Use this Mac for development; the same Take Photo control requests the rear camera on iPhone/iPad.'}</span></div>
      <div className="deviceStatus"><span className={secure?'dot ok':'dot'}></span>{secure?'HTTPS / secure context':'Not secure — voice may be blocked'}</div>
    </div>

    <section className="card">
      <div className="sectionTitle"><span>1</span><div><h2>Excursion details</h2><p>Basic information about the visit.</p></div></div>
      <div className="grid">
        <label>Report type<select value={data.reportType} onChange={e=>set('reportType',e.target.value)}><option>Excursion Report</option><option>Industry Visit Report</option><option>Curriculum Experience Report</option><option>Incursion / Guest Speaker Report</option></select></label>
        <label>Excursion / event name<input value={data.excursionName} onChange={e=>set('excursionName',e.target.value)} placeholder="Big Day In"/></label>
        <label>Venue<input value={data.venue} onChange={e=>set('venue',e.target.value)} placeholder="Griffith University, Gold Coast"/></label>
        <label>Date<input type="date" value={data.excursionDate} onChange={e=>set('excursionDate',e.target.value)}/></label>
        <label>Year level(s)<input value={data.yearLevels} onChange={e=>set('yearLevels',e.target.value)} placeholder="Year 10–11"/></label>
        <label>Subject / program<input value={data.subject} onChange={e=>set('subject',e.target.value)} placeholder="Digital Technologies"/></label>
        <label className="full">Staff / teacher <span className="optional">optional</span><input value={data.staff} onChange={e=>set('staff',e.target.value)} placeholder="Mr Elliott"/></label>
      </div>

      <div className="sectionTitle top"><span>2</span><div><h2>Capture evidence</h2><p>Take a new photo or add an existing image. Photos stay in the active workflow until the report is saved or cleared.</p></div></div>
      <div className="captureButtons">
        <label className="fileButton cameraButton"><span className="buttonIcon">📷</span><span><strong>Take Photo</strong><small>{mobile?'Open rear camera':'Opens camera on supported mobile devices'}</small></span><input type="file" accept="image/*" capture="environment" onChange={e=>{addFiles(e.target.files);e.target.value=''}}/></label>
        <label className="fileButton secondaryFile"><span className="buttonIcon">🖼️</span><span><strong>Add Existing Photos</strong><small>Photo library or Files</small></span><input type="file" accept="image/*" multiple onChange={e=>{addFiles(e.target.files);e.target.value=''}}/></label>
      </div>
      <span className="hint">{photos.length?`${photos.length} photo(s) ready · maximum 12`:'No photos added yet'}</span>

      {!!photos.length&&<div className="photoGrid">{photos.map((p,i)=><article className="photoCard" key={p.id}>
        <img src={p.url} alt={`Excursion photo ${i+1}`}/><div className="photoMeta"><strong>Photo {i+1}</strong><button className="remove" type="button" onClick={()=>removePhoto(p.id)}>Remove</button></div>
        <input aria-label={`Caption for photo ${i+1}`} value={p.caption} onChange={e=>caption(p.id,e.target.value)} placeholder="Optional caption — what is happening here?"/>
      </article>)}</div>}

      <label>Quick notes<textarea rows="8" value={data.notes} onChange={e=>set('notes',e.target.value)} placeholder={'Examples:\n• Students attended technology industry presentations\n• Speaker discussed careers in cyber security and AI\n• Students asked questions about university pathways\n• Strong engagement during robotics demonstration\n• Follow up: career reflection next lesson'}/></label>
      <div className="voiceRow">
        {!recording?<button type="button" className="voice" disabled={transcribing} onClick={startRecording}>🎤 {transcribing?'Transcribing…':'Dictate note'}</button>:<button type="button" className="voice recording" onClick={stopRecording}>■ Stop & transcribe</button>}
        <span>{secure?'Speak naturally. The transcript is appended to your notes.':'Open the app over HTTPS for microphone access on mobile.'}</span>
      </div>
      <p className="tip"><strong>Tip:</strong> Record facts, names and observations as short dot points. The AI improves the wording but is instructed not to invent details.</p>

      {!report?<button className="primary generateButton" disabled={busy||!data.notes.trim()} onClick={generate}>{busy?'Creating report…':'Generate excursion report'}</button>
      :<div className="report">
        <div className="sectionTitle"><span>3</span><div><h2>Review excursion report</h2><p>Edit anything before it becomes the official record.</p></div></div>
        <label>Excursion overview<textarea rows="5" value={report.summary||''} onChange={e=>setReport({...report,summary:e.target.value})}/></label>
        <label>Activities and experiences<textarea rows="5" value={report.activities||''} onChange={e=>setReport({...report,activities:e.target.value})}/></label>
        <label>Learning and educational value<textarea rows="5" value={report.learningOutcomes||''} onChange={e=>setReport({...report,learningOutcomes:e.target.value})}/></label>
        <label>Student engagement / observations<textarea rows="4" value={report.studentEngagement||''} onChange={e=>setReport({...report,studentEngagement:e.target.value})}/></label>
        <label>Follow-up / next steps<textarea rows="4" value={report.followUp||''} onChange={e=>setReport({...report,followUp:e.target.value})}/></label>
        <label>Additional notes<textarea rows="3" value={report.additionalNotes||''} onChange={e=>setReport({...report,additionalNotes:e.target.value})}/></label>
        <div className="actions"><button className="secondary" disabled={busy} onClick={()=>setReport(null)}>Back to notes</button><button className="primary" disabled={busy||!status.sharePointConfigured} onClick={save}>{status.sharePointConfigured?(busy?'Saving…':'Approve & save to SharePoint'):'SharePoint connection pending'}</button></div>
      </div>}
      {msg&&<p className="message">{msg}</p>}
    </section>
  </main>
}

createRoot(document.getElementById('root')).render(<App/>);
