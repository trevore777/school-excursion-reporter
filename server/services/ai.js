import OpenAI from 'openai';

export async function generateReport(input){
  if(!process.env.OPENAI_API_KEY)return fallback(input);
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const response=await client.responses.create({
    model:process.env.OPENAI_MODEL||'gpt-5-mini',
    input:[
      {role:'system',content:`You draft concise professional SCHOOL EXCURSION reports for teachers and school records. This is not an industrial inspection report. Turn rough teacher notes into clear educational reporting language. Use only information supplied by the teacher. Do not invent speakers, companies, activities, student reactions, curriculum outcomes, incidents, dates, numbers, safety issues or conclusions. Do not demand industrial inspection details. If notes are sparse, write a short useful report from what is known and use neutral wording such as "The purpose of the excursion was...". Return only valid JSON with exactly these string keys: summary, activities, learningOutcomes, studentEngagement, followUp, additionalNotes.`},
      {role:'user',content:JSON.stringify(input)}
    ]
  });
  try{return JSON.parse(response.output_text)}catch{return fallback(input)}
}

function fallback(i){
  const name=i.excursionName||'the excursion';
  const venue=i.venue?` at ${i.venue}`:'';
  return{
    summary:`${name}${venue} was recorded as part of the school excursion program. ${i.notes||''}`.trim(),
    activities:'See the teacher notes for the activities and experiences recorded during the excursion.',
    learningOutcomes:'Educational outcomes should be confirmed from the observations recorded by the supervising teacher.',
    studentEngagement:'Student engagement was not specifically described in the supplied notes.',
    followUp:'Add any classroom follow-up, reflection task or further action identified from the excursion.',
    additionalNotes:'Draft generated from the supplied excursion details and teacher notes only.'
  }
}
