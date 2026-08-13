import PDFDocument from 'pdfkit';

export function makePdf(article, photos = []) {
  return new Promise((resolve, reject) => {
    const title = article.headline || article.excursionName || 'School Excursion News';
    const doc = new PDFDocument({
      size: 'A4',
      margin: 46,
      info: { Title: title }
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#486581')
      .text('SCHOOL EXCURSION NEWS');

    doc.moveDown(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(25)
      .fillColor('#102a43')
      .text(title, { lineGap: 2 });

    if (article.subheadline) {
      doc.moveDown(0.45);
      doc
        .font('Helvetica')
        .fontSize(13)
        .fillColor('#486581')
        .text(article.subheadline, { lineGap: 2 });
    }

    doc.moveDown(0.8);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#627d98')
      .text(metadataLine(article));

    let nextPhoto = 0;

    if (photos.length) {
      doc.moveDown(0.9);
      addImage(doc, photos[0].buffer, pageWidth, 285);
      addCaption(doc, photos[0].caption, 1);
      nextPhoto = 1;
    }

    const paragraphs = splitParagraphs(article.articleBody);
    paragraphs.forEach((paragraph, index) => {
      ensureSpace(doc, 120);
      doc.moveDown(index === 0 ? 0.8 : 0.55);
      doc
        .font('Helvetica')
        .fontSize(11.2)
        .fillColor('#243b53')
        .text(paragraph, {
          lineGap: 3,
          align: 'left'
        });

      const shouldInsertPhoto = (index % 2 === 1 || index === paragraphs.length - 1) && nextPhoto < photos.length;
      if (shouldInsertPhoto) {
        ensureSpace(doc, 250);
        doc.moveDown(0.8);
        addImage(doc, photos[nextPhoto].buffer, pageWidth, 230);
        addCaption(doc, photos[nextPhoto].caption, nextPhoto + 1);
        nextPhoto += 1;
      }
    });

    if (article.learningConnection) {
      ensureSpace(doc, 120);
      doc.moveDown(1);
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#102a43')
        .text('Learning connection');
      doc.moveDown(0.25);
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor('#334e68')
        .text(article.learningConnection, { lineGap: 2.5 });
    }

    if (article.closingNote) {
      ensureSpace(doc, 90);
      doc.moveDown(0.8);
      doc
        .font('Helvetica-Oblique')
        .fontSize(9.5)
        .fillColor('#627d98')
        .text(article.closingNote, { lineGap: 2 });
    }

    while (nextPhoto < photos.length) {
      doc.addPage();
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor('#102a43')
        .text(`Photo ${nextPhoto + 1}`);
      doc.moveDown(0.7);
      addImage(doc, photos[nextPhoto].buffer, pageWidth, 500);
      addCaption(doc, photos[nextPhoto].caption, nextPhoto + 1);
      nextPhoto += 1;
    }

    doc.end();
  });
}

function metadataLine(article) {
  const parts = [];
  if (article.excursionDate) parts.push(formatDate(article.excursionDate));
  if (article.venue) parts.push(article.venue);
  if (article.yearLevels) parts.push(article.yearLevels);
  if (article.subject) parts.push(article.subject);
  if (article.staff) parts.push(`By ${article.staff}`);
  return parts.join('  •  ') || 'School excursion article';
}

function splitParagraphs(value) {
  const text = String(value || '').trim();
  if (!text) return ['Excursion details were recorded by the supervising teacher.'];
  return text
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function addImage(doc, buffer, width, maxHeight) {
  try {
    doc.image(buffer, {
      fit: [width, maxHeight],
      align: 'center',
      valign: 'center'
    });
  } catch {
    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor('#829ab1')
      .text('Photo could not be rendered in the PDF.');
  }
}

function addCaption(doc, caption, number) {
  if (!caption?.trim()) return;
  doc.moveDown(0.25);
  doc
    .font('Helvetica-Oblique')
    .fontSize(8.8)
    .fillColor('#627d98')
    .text(`Photo ${number}: ${caption.trim()}`, { align: 'left' });
}

function ensureSpace(doc, requiredHeight) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + requiredHeight > bottom) doc.addPage();
}

function formatDate(value) {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
}
