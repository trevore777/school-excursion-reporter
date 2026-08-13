import PDFDocument from 'pdfkit';
export function makePdf(r){return new Promise(resolve=>{
  const doc=new PDFDocument({margin:50,info:{Title:`${r.excursionName||'Excursion'} - School Excursion Report`}});const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.fontSize(22).text(r.reportType||'School Excursion Report');
  doc.moveDown().fontSize(11).text(`Excursion / event: ${r.excursionName||'—'}`).text(`Venue: ${r.venue||'—'}`).text(`Date: ${formatDate(r.excursionDate)}`).text(`Year level(s): ${r.yearLevels||'—'}`).text(`Subject / program: ${r.subject||'—'}`).text(`Staff / teacher: ${r.staff||'—'}`);
  for(const [h,v] of [['Excursion overview',r.summary],['Activities and experiences',r.activities],['Learning and educational value',r.learningOutcomes],['Student engagement / observations',r.studentEngagement],['Follow-up / next steps',r.followUp],['Additional notes',r.additionalNotes]]){doc.moveDown().fontSize(14).text(h);doc.fontSize(11).text(v||'—')}
  const captions=(r.photoCaptions||[]).filter(x=>x.caption?.trim());if(captions.length){doc.moveDown().fontSize(14).text('Photo captions');doc.fontSize(11);captions.forEach(x=>doc.text(`Photo ${x.number}: ${x.caption}`))}
  doc.moveDown(2).fontSize(8).fillColor('#66788a').text('Prepared from teacher-supplied excursion details and notes. Reviewed by the user before saving.');doc.end();
})}
function formatDate(v){if(!v)return new Date().toLocaleDateString('en-AU');const d=new Date(`${v}T00:00:00`);return Number.isNaN(d.getTime())?v:d.toLocaleDateString('en-AU')}
