import { jsPDF } from 'jspdf';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

function safeFileName(value) {
  return (value || 'Excursion')
    .replace(/[^a-z0-9 _-]/gi, '')
    .trim() || 'Excursion';
}

function formatDate(value) {
  if (!value) return new Date().toLocaleDateString('en-AU');
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-AU');
}

function metadataLine(article) {
  return [
    article.excursionDate ? formatDate(article.excursionDate) : '',
    article.venue || '',
    article.yearLevels || '',
    article.subject || ''
  ].filter(Boolean).join(' • ');
}

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n\s*\n|\n(?=[A-Z])/)
    .map(value => value.trim())
    .filter(Boolean);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read image ${file.name || ''}`.trim()));
    };
    image.src = url;
  });
}

async function compressPhoto(file, maxDimension = 1600, quality = 0.78) {
  const image = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    width,
    height
  };
}

function addWrappedText(pdf, text, x, y, width, options = {}) {
  const {
    font = 'helvetica',
    style = 'normal',
    size = 11,
    color = [36, 59, 83],
    lineHeight = 5.7
  } = options;
  pdf.setFont(font, style);
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  const lines = pdf.splitTextToSize(String(text || ''), width);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function ensureSpace(pdf, y, needed) {
  if (y + needed <= PAGE_H - MARGIN) return y;
  pdf.addPage();
  return MARGIN;
}

function addPhoto(pdf, photo, imageData, y, maxHeight = 88) {
  y = ensureSpace(pdf, y, 55);
  const ratio = imageData.width / imageData.height;
  let width = CONTENT_W;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  const x = MARGIN + (CONTENT_W - width) / 2;
  pdf.addImage(imageData.dataUrl, 'JPEG', x, y, width, height, undefined, 'FAST');
  y += height + 3;
  if (photo.caption?.trim()) {
    y = addWrappedText(pdf, photo.caption.trim(), MARGIN, y, CONTENT_W, {
      style: 'italic',
      size: 8.5,
      color: [98, 125, 152],
      lineHeight: 4.3
    });
  }
  return y + 3;
}

function addSection(pdf, heading, text, y) {
  if (!text?.trim()) return y;
  y = ensureSpace(pdf, y, 28);
  y = addWrappedText(pdf, heading, MARGIN, y, CONTENT_W, {
    style: 'bold',
    size: 12.5,
    color: [16, 42, 67],
    lineHeight: 6
  });
  y += 1;
  y = addWrappedText(pdf, text.trim(), MARGIN, y, CONTENT_W, {
    size: 10.7,
    lineHeight: 5.5
  });
  return y + 4;
}

export async function exportNewsPdf({ article, photos }) {
  if (!article) throw new Error('Generate the news article before exporting.');

  const compressed = [];
  for (const photo of photos) {
    compressed.push({
      ...photo,
      imageData: await compressPhoto(photo.file)
    });
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  let y = MARGIN;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(72, 101, 129);
  pdf.text('SCHOOL EXCURSION NEWS', MARGIN, y);
  y += 7;

  y = addWrappedText(
    pdf,
    article.headline || article.excursionName || 'Excursion News',
    MARGIN,
    y,
    CONTENT_W,
    { style: 'bold', size: 23, color: [16, 42, 67], lineHeight: 9 }
  );

  if (article.subheadline?.trim()) {
    y += 2;
    y = addWrappedText(pdf, article.subheadline.trim(), MARGIN, y, CONTENT_W, {
      size: 12.2,
      color: [72, 101, 129],
      lineHeight: 6
    });
  }

  y += 3;
  y = addWrappedText(pdf, metadataLine(article), MARGIN, y, CONTENT_W, {
    size: 8.5,
    color: [98, 125, 152],
    lineHeight: 4.5
  });
  y += 3;

  let photoIndex = 0;
  if (compressed.length) {
    y = addPhoto(pdf, compressed[0], compressed[0].imageData, y, 92);
    photoIndex = 1;
  }

  const paragraphs = splitParagraphs(article.articleBody);
  for (let index = 0; index < paragraphs.length; index += 1) {
    y = ensureSpace(pdf, y, 28);
    y = addWrappedText(pdf, paragraphs[index], MARGIN, y, CONTENT_W, {
      size: 10.9,
      lineHeight: 5.6
    });
    y += 3;

    if ((index % 2 === 1 || index === paragraphs.length - 1) && photoIndex < compressed.length) {
      y = addPhoto(pdf, compressed[photoIndex], compressed[photoIndex].imageData, y, 72);
      photoIndex += 1;
    }
  }

  while (photoIndex < compressed.length) {
    y = addPhoto(pdf, compressed[photoIndex], compressed[photoIndex].imageData, y, 66);
    photoIndex += 1;
  }

  y = addSection(pdf, 'Learning connection', article.learningConnection, y);
  y = addSection(pdf, 'Closing note', article.closingNote, y);

  y = ensureSpace(pdf, y, 14);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(120, 140, 155);
  pdf.text('Prepared from teacher-supplied excursion notes and reviewed before export.', MARGIN, y + 4);

  const safeName = safeFileName(article.excursionName);
  const date = article.excursionDate || new Date().toISOString().slice(0, 10);
  const filename = `${date}_${safeName}_News-Article.pdf`;
  const blob = pdf.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: article.headline || 'Excursion News Article'
      });
      return { filename, shared: true };
    } catch (error) {
      if (error?.name === 'AbortError') return { filename, shared: false, cancelled: true };
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return { filename, shared: false };
}
