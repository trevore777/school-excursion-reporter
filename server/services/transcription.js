import OpenAI from 'openai';

export async function transcribeAudio(buffer,mimeType='audio/webm'){
  if(!process.env.OPENAI_API_KEY)throw new Error('Voice transcription needs OPENAI_API_KEY in .env.');
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const ext=mimeType.includes('mp4')?'m4a':mimeType.includes('ogg')?'ogg':'webm';
  const file=new File([buffer],`excursion-note.${ext}`,{type:mimeType});
  const result=await client.audio.transcriptions.create({model:process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe',file});
  return result.text||'';
}
