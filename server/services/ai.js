import OpenAI from 'openai';

export async function generateReport(input) {
  if (!process.env.OPENAI_API_KEY) return fallback(input);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    input: [
      {
        role: 'system',
        content: `You are a school communications writer. Turn teacher-supplied excursion notes into a polished NEWS ARTICLE suitable for a school newsletter, website or parent communication.

Write in an engaging but factual school-news style. This is not an industrial report and not a compliance report.

Rules:
- Use only facts supplied by the teacher.
- Do not invent speakers, organisations, activities, quotes, student reactions, learning outcomes, incidents, dates, numbers or achievements.
- Do not claim every student felt or learned something unless the notes support it.
- Where the notes are brief, keep the article concise rather than filling gaps with invented detail.
- Prefer active, readable language and Australian English.
- The articleBody should be 3 to 6 short paragraphs when enough information is available.
- Mention the venue, year levels, subject/program and educational purpose naturally when supplied.
- Do not include markdown headings inside articleBody.

Return only valid JSON with exactly these string keys:
headline, subheadline, articleBody, learningConnection, closingNote.`
      },
      {
        role: 'user',
        content: JSON.stringify(input)
      }
    ]
  });

  try {
    return JSON.parse(response.output_text);
  } catch {
    return fallback(input);
  }
}

function fallback(i) {
  const name = i.excursionName || 'School excursion';
  const venue = i.venue ? ` at ${i.venue}` : '';
  const yearLevels = i.yearLevels ? `${i.yearLevels} students` : 'Students';
  const subject = i.subject ? ` as part of ${i.subject}` : '';

  return {
    headline: `${name}: learning beyond the classroom`,
    subheadline: `${yearLevels} took part in an off-campus learning experience${venue}.`,
    articleBody: `${yearLevels} participated in ${name}${venue}${subject}.\n\n${i.notes || 'The excursion provided an opportunity to extend learning beyond the classroom.'}`.trim(),
    learningConnection: i.subject
      ? `The experience supported learning connected with ${i.subject}.`
      : 'The excursion extended student learning beyond the classroom.',
    closingNote: 'This article was prepared from the excursion details and teacher notes supplied.'
  };
}
