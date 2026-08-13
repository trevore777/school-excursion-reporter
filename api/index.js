import 'dotenv/config';

import express from 'express';
import session from 'express-session';
import multer from 'multer';
import sharp from 'sharp';

import { generateReport } from '../server/services/ai.js';
import { transcribeAudio } from '../server/services/transcription.js';
import { makePdf } from '../server/services/pdf.js';
import { ensureFolder, upload } from '../server/services/graph.js';
import { loginUrl, redeem } from '../server/services/auth.js';

const app = express();

const photosUp = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 12
  }
});

const audioUp = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1
  }
});

app.use(
  express.json({
    limit: '1mb'
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

const microsoftConfigured = () =>
  Boolean(
    process.env.MICROSOFT_TENANT_ID &&
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.MICROSOFT_REDIRECT_URI
  );

const sharePointConfigured = () =>
  Boolean(
    microsoftConfigured() &&
      process.env.SHAREPOINT_DRIVE_ID
  );

const getAppUrl = () =>
  process.env.APP_URL || 'http://localhost:5173';

/**
 * Status
 */
app.get('/api/status', (req, res) => {
  res.json({
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    microsoftConfigured: microsoftConfigured(),
    sharePointConfigured: sharePointConfigured(),
    signedIn: Boolean(req.session.graphToken),
    user: req.session.user || null
  });
});

/**
 * Microsoft sign-in
 */
app.get('/api/auth/login', async (req, res) => {
  try {
    if (!microsoftConfigured()) {
      return res.status(503).send(
        'Microsoft sign-in is not configured yet.'
      );
    }

    const url = await loginUrl();
    res.redirect(url);
  } catch (error) {
    console.error('Microsoft login error:', error);
    res.status(503).send(error.message);
  }
});

/**
 * Microsoft callback
 */
app.get('/api/auth/callback', async (req, res) => {
  try {
    if (!req.query.code) {
      throw new Error('Microsoft did not return an authorization code.');
    }

    const result = await redeem(req.query.code);

    req.session.graphToken = result.accessToken;
    req.session.user =
      result.account?.username ||
      result.account?.name ||
      null;

    res.redirect(getAppUrl());
  } catch (error) {
    console.error('Microsoft callback error:', error);
    res.status(500).send(error.message);
  }
});

/**
 * Microsoft logout
 */
app.get('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect(getAppUrl());
  });
});

/**
 * Voice-note transcription
 */
app.post(
  '/api/notes/transcribe',
  audioUp.single('audio'),
  async (req, res) => {
    try {
      if (!req.file) {
        throw new Error('No audio was received.');
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          error: 'OpenAI is not configured.'
        });
      }

      const text = await transcribeAudio(
        req.file.buffer,
        req.file.mimetype
      );

      res.json({
        text
      });
    } catch (error) {
      console.error('Transcription error:', error);

      res.status(500).json({
        error: error.message
      });
    }
  }
);

/**
 * AI excursion-report generation
 */
app.post('/api/reports/generate', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: 'OpenAI is not configured.'
      });
    }

    const report = await generateReport(req.body);

    res.json(report);
  } catch (error) {
    console.error('Report generation error:', error);

    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * Save excursion report and photos to SharePoint
 */
app.post(
  '/api/sharepoint/save',
  photosUp.array('photos', 12),
  async (req, res) => {
    try {
      if (!sharePointConfigured()) {
        return res.status(503).json({
          error:
            'SharePoint connection is pending IT configuration.'
        });
      }

      if (!req.session.graphToken) {
        return res.status(401).json({
          error: 'Sign in with Microsoft first.'
        });
      }

      if (!req.body.report) {
        return res.status(400).json({
          error: 'No report data was received.'
        });
      }

      const report = JSON.parse(req.body.report);

      const safeName =
        (report.excursionName || 'Excursion')
          .replace(/[^a-z0-9 _-]/gi, '')
          .trim() || 'Excursion';

      const date =
        report.excursionDate ||
        new Date().toISOString().slice(0, 10);

      const year =
        (
          date.match(/^\d{4}/) || [
            String(new Date().getFullYear())
          ]
        )[0];

      const rootFolder =
        process.env.SHAREPOINT_ROOT_FOLDER ||
        'School Excursion Reports';

      const folderPath =
        `${rootFolder}/${year}/${date} - ${safeName}`;

      const parentFolderId = await ensureFolder(
        req.session.graphToken,
        process.env.SHAREPOINT_DRIVE_ID,
        folderPath
      );

      const uploadedFiles = [];

      /**
       * Generate and upload PDF
       */
      const pdf = await makePdf(report);

      const pdfResult = await upload(
        req.session.graphToken,
        process.env.SHAREPOINT_DRIVE_ID,
        parentFolderId,
        `${date}_${safeName}_Excursion-Report.pdf`,
        pdf,
        'application/pdf'
      );

      uploadedFiles.push(pdfResult);

      /**
       * Resize/compress and upload photographs
       */
      let photoNumber = 1;

      for (const file of req.files || []) {
        const image = await sharp(file.buffer)
          .rotate()
          .resize({
            width: 1800,
            height: 1800,
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({
            quality: 82
          })
          .toBuffer();

        const filename =
          `${date}_${safeName}_Photo-` +
          `${String(photoNumber).padStart(2, '0')}.jpg`;

        const photoResult = await upload(
          req.session.graphToken,
          process.env.SHAREPOINT_DRIVE_ID,
          parentFolderId,
          filename,
          image,
          'image/jpeg'
        );

        uploadedFiles.push(photoResult);

        photoNumber += 1;
      }

      res.json({
        ok: true,
        files: uploadedFiles.map(file => ({
          id: file.id,
          name: file.name,
          webUrl: file.webUrl
        }))
      });
    } catch (error) {
      console.error('SharePoint save error:', error);

      res.status(500).json({
        error: error.message
      });
    }
  }
);

/**
 * Simple API health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'School Excursion Reporter API'
  });
});

/**
 * Vercel imports this Express application.
 *
 * Do NOT call app.listen() here.
 */
export default app;