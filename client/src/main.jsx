import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const today = () => new Date().toISOString().slice(0, 10);
const fresh = () => ({
  reportType: 'Excursion News Article',
  excursionName: '',
  venue: '',
  excursionDate: today(),
  yearLevels: '',
  subject: 'Digital Technologies',
  staff: '',
  notes: ''
});

function isMobileLike() {
  if (typeof navigator === 'undefined') return false;
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function App() {
  const [data, setData] = useState(fresh);
  const [photos, setPhotos] = useState([]);
  const [article, setArticle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [exported, setExported] = useState(false);
  const [status, setStatus] = useState({
    aiConfigured: false,
    microsoftConfigured: false,
    sharePointConfigured: false
  });
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const photosRef = useRef([]);

  const mobile = isMobileLike();
  const secure = window.isSecureContext;
  const set = (key, value) => setData(current => ({ ...current, [key]: value }));

  useEffect(() => {
    fetch('/api/status')
      .then(response => response.json())
      .then(setStatus)
      .catch(() => {});

    return () => {
      photosRef.current.forEach(photo => URL.revokeObjectURL(photo.url));
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  async function parseResponse(response, label) {
    const text = await response.text();
    if (!text) throw new Error(`${label} returned an empty response (${response.status}).`);

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${label} returned non-JSON (${response.status}): ${text.slice(0, 300)}`);
    }

    if (!response.ok) throw new Error(json.error || `${label} failed (${response.status}).`);
    return json;
  }

  function addFiles(files) {
    const selected = [...files].filter(file => file.type.startsWith('image/'));
    if (!selected.length) return;

    const next = selected.map(file => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      caption: ''
    }));

    setPhotos(current => {
      const combined = [...current, ...next];
      const kept = combined.slice(0, 12);
      combined.slice(12).forEach(photo => URL.revokeObjectURL(photo.url));
      return kept;
    });
    setExported(false);
  }

  function removePhoto(id) {
    setPhotos(current =>
      current.filter(photo => {
        if (photo.id === id) {
          URL.revokeObjectURL(photo.url);
          return false;
        }
        return true;
      })
    );
    setExported(false);
  }

  function caption(id, value) {
    setPhotos(current =>
      current.map(photo => (photo.id === id ? { ...photo, caption: value } : photo))
    );
    setExported(false);
  }

  async function startRecording() {
    setMsg('');
    try {
      if (!secure) {
        throw new Error('Voice notes need a secure HTTPS connection on phones and tablets.');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone recording is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setRecording(false);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm'
        });
        chunksRef.current = [];
        await transcribe(blob);
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      setMsg(error.message);
      setRecording(false);
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  async function transcribe(blob) {
    setTranscribing(true);
    setMsg('');
    try {
      const form = new FormData();
      form.append('audio', blob, 'excursion-note.webm');
      const response = await fetch('/api/notes/transcribe', {
        method: 'POST',
        body: form
      });
      const result = await parseResponse(response, 'Voice transcription');
      setData(current => ({
        ...current,
        notes: [current.notes, result.text]
          .filter(Boolean)
          .join(current.notes ? '\n' : '')
          .trim()
      }));
      setExported(false);
    } catch (error) {
      setMsg(error.message);
    } finally {
      setTranscribing(false);
    }
  }

  function articlePayload() {
    return {
      ...data,
      ...article,
      photoCaptions: photos.map((photo, index) => ({
        number: index + 1,
        caption: photo.caption
      }))
    };
  }

  async function generate() {
    setBusy(true);
    setMsg('');
    setExported(false);

    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          photoCaptions: photos.map((photo, index) => ({
            number: index + 1,
            caption: photo.caption
          }))
        })
      });

      setArticle(await parseResponse(response, 'AI news article generation'));
      requestAnimationFrame(() =>
        document.querySelector('.articleReview')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      );
    } catch (error) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!article) return;
    setBusy(true);
    setMsg('');

    try {
      const form = new FormData();
      form.append('report', JSON.stringify(articlePayload()));
      photos.forEach(photo => form.append('photos', photo.file));

      const response = await fetch('/api/reports/pdf', {
        method: 'POST',
        body: form
      });

      if (!response.ok) {
        const text = await response.text();
        let message = text;
        try {
          message = JSON.parse(text).error || text;
        } catch {}
        throw new Error(message || `PDF export failed (${response.status}).`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = (data.excursionName || 'Excursion')
        .replace(/[^a-z0-9 _-]/gi, '')
        .trim() || 'Excursion';
      link.href = url;
      link.download = `${data.excursionDate}_${safeName}_News-Article.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      setExported(true);
      setMsg('News article PDF exported. You can now clear the active excursion data from this device.');
    } catch (error) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!status.sharePointConfigured) {
      setMsg('SharePoint connection is pending IT setup. You can still export the news article PDF.');
      return;
    }

    setBusy(true);
    setMsg('');
    try {
      const form = new FormData();
      form.append('report', JSON.stringify(articlePayload()));
      photos.forEach(photo => form.append('photos', photo.file));
      const response = await fetch('/api/sharepoint/save', {
        method: 'POST',
        body: form
      });
      const result = await parseResponse(response, 'SharePoint save');
      setMsg(`Saved ${result.files?.length || 0} file(s) to SharePoint.`);
      setExported(true);
    } catch (error) {
      setMsg(error.message);
    } finally {
      setBusy(false);
    }
  }

  function clearDeviceData() {
    const confirmed = window.confirm(
      'Clear this excursion from the app on this device? This removes the active photos, captions, notes and generated article from the app. It cannot delete original photos from the Photos app or a PDF already saved to Downloads/Files.'
    );
    if (!confirmed) return;

    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
    photos.forEach(photo => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setData(fresh());
    setArticle(null);
    setRecording(false);
    setTranscribing(false);
    setExported(false);
    setMsg('Active excursion data cleared from the app on this device.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main>
      <header>
        <div>
          <small>SCHOOL EXCURSION REPORTER</small>
          <h1>Capture the day.<br />Publish the story.</h1>
          <p>
            Take photos, add captions and dictate or type quick notes. AI turns the excursion into an editable school news article with photos, ready to export as a PDF.
          </p>
        </div>
        {status.microsoftConfigured ? (
          <a className="signin" href="/api/auth/login">Microsoft sign-in</a>
        ) : (
          <button className="signin pending" disabled>SharePoint pending</button>
        )}
      </header>

      {!status.sharePointConfigured && (
        <div className="setupBanner">
          <strong>Development mode:</strong> SharePoint is waiting on school IT approval. News article generation and PDF export work independently.
        </div>
      )}

      <div className={`deviceBanner ${secure ? 'ready' : 'warning'}`}>
        <div>
          <strong>{mobile ? 'Mobile capture mode' : 'Desktop test mode'}</strong>
          <span>
            {mobile
              ? '“Take Photo” requests the phone/tablet rear camera.'
              : 'Use this Mac for development; Take Photo requests the rear camera on iPhone/iPad.'}
          </span>
        </div>
        <div className="deviceStatus">
          <span className={secure ? 'dot ok' : 'dot'}></span>
          {secure ? 'HTTPS / secure context' : 'Not secure — voice may be blocked'}
        </div>
      </div>

      <section className="card">
        <div className="sectionTitle">
          <span>1</span>
          <div>
            <h2>Excursion details</h2>
            <p>Basic information that will appear in the article.</p>
          </div>
        </div>

        <div className="grid">
          <label>
            Output type
            <select value={data.reportType} onChange={event => set('reportType', event.target.value)}>
              <option>Excursion News Article</option>
              <option>School Newsletter Article</option>
              <option>Website News Article</option>
            </select>
          </label>
          <label>
            Excursion / event name
            <input value={data.excursionName} onChange={event => set('excursionName', event.target.value)} placeholder="Big Day In" />
          </label>
          <label>
            Venue
            <input value={data.venue} onChange={event => set('venue', event.target.value)} placeholder="Griffith University, Gold Coast" />
          </label>
          <label>
            Date
            <input type="date" value={data.excursionDate} onChange={event => set('excursionDate', event.target.value)} />
          </label>
          <label>
            Year level(s)
            <input value={data.yearLevels} onChange={event => set('yearLevels', event.target.value)} placeholder="Year 10–11" />
          </label>
          <label>
            Subject / program
            <input value={data.subject} onChange={event => set('subject', event.target.value)} placeholder="Digital Technologies" />
          </label>
          <label className="full">
            Staff / teacher <span className="optional">optional</span>
            <input value={data.staff} onChange={event => set('staff', event.target.value)} placeholder="Mr Elliott" />
          </label>
        </div>

        <div className="sectionTitle top">
          <span>2</span>
          <div>
            <h2>Capture the story</h2>
            <p>Photos and captions will be placed into the exported news article PDF.</p>
          </div>
        </div>

        <div className="captureButtons">
          <label className="fileButton cameraButton">
            <span className="buttonIcon">📷</span>
            <span>
              <strong>Take Photo</strong>
              <small>{mobile ? 'Open rear camera' : 'Opens camera on supported mobile devices'}</small>
            </span>
            <input type="file" accept="image/*" capture="environment" onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />
          </label>

          <label className="fileButton secondaryFile">
            <span className="buttonIcon">🖼️</span>
            <span>
              <strong>Add Existing Photos</strong>
              <small>Photo library or Files</small>
            </span>
            <input type="file" accept="image/*" multiple onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />
          </label>
        </div>

        <span className="hint">
          {photos.length ? `${photos.length} photo(s) ready · maximum 12` : 'No photos added yet'}
        </span>

        {!!photos.length && (
          <div className="photoGrid">
            {photos.map((photo, index) => (
              <article className="photoCard" key={photo.id}>
                <img src={photo.url} alt={`Excursion photo ${index + 1}`} />
                <div className="photoMeta">
                  <strong>Photo {index + 1}</strong>
                  <button className="remove" type="button" onClick={() => removePhoto(photo.id)}>Remove</button>
                </div>
                <input
                  aria-label={`Caption for photo ${index + 1}`}
                  value={photo.caption}
                  onChange={event => caption(photo.id, event.target.value)}
                  placeholder="Caption — who or what is happening here?"
                />
              </article>
            ))}
          </div>
        )}

        <label>
          Quick notes
          <textarea
            rows="8"
            value={data.notes}
            onChange={event => { set('notes', event.target.value); setExported(false); }}
            placeholder={'Examples:\n• Students attended technology industry presentations\n• Speaker discussed careers in cyber security and AI\n• Students asked questions about university pathways\n• Strong engagement during robotics demonstration\n• Follow up with a career reflection next lesson'}
          />
        </label>

        <div className="voiceRow">
          {!recording ? (
            <button type="button" className="voice" disabled={transcribing} onClick={startRecording}>
              🎤 {transcribing ? 'Transcribing…' : 'Dictate note'}
            </button>
          ) : (
            <button type="button" className="voice recording" onClick={stopRecording}>
              ■ Stop & transcribe
            </button>
          )}
          <span>
            {secure
              ? 'Speak naturally. The transcript is appended to your notes.'
              : 'Open the app over HTTPS for microphone access on mobile.'}
          </span>
        </div>

        <p className="tip">
          <strong>Tip:</strong> Capture names, activities, interesting moments and learning connections. The AI is instructed not to invent missing details.
        </p>

        {!article ? (
          <button className="primary generateButton" disabled={busy || !data.notes.trim()} onClick={generate}>
            {busy ? 'Writing article…' : 'Generate news article'}
          </button>
        ) : (
          <div className="articleReview">
            <div className="sectionTitle">
              <span>3</span>
              <div>
                <h2>Review the news article</h2>
                <p>Edit anything before exporting or saving.</p>
              </div>
            </div>

            <div className="newsPreview">
              <small>SCHOOL NEWS</small>
              <h3>{article.headline || 'Excursion headline'}</h3>
              <p className="standfirst">{article.subheadline}</p>
              {!!photos.length && <img src={photos[0].url} alt="Lead excursion" />}
            </div>

            <label>
              Headline
              <input value={article.headline || ''} onChange={event => { setArticle({ ...article, headline: event.target.value }); setExported(false); }} />
            </label>
            <label>
              Subheading
              <textarea rows="2" value={article.subheadline || ''} onChange={event => { setArticle({ ...article, subheadline: event.target.value }); setExported(false); }} />
            </label>
            <label>
              News article
              <textarea rows="14" value={article.articleBody || ''} onChange={event => { setArticle({ ...article, articleBody: event.target.value }); setExported(false); }} />
            </label>
            <label>
              Learning connection
              <textarea rows="3" value={article.learningConnection || ''} onChange={event => { setArticle({ ...article, learningConnection: event.target.value }); setExported(false); }} />
            </label>
            <label>
              Closing note
              <textarea rows="2" value={article.closingNote || ''} onChange={event => { setArticle({ ...article, closingNote: event.target.value }); setExported(false); }} />
            </label>

            <div className="actions articleActions">
              <button className="secondary" disabled={busy} onClick={() => { setArticle(null); setExported(false); }}>
                Back to notes
              </button>
              <button className="primary export" disabled={busy} onClick={exportPdf}>
                {busy ? 'Preparing PDF…' : 'Export news article PDF'}
              </button>
              <button className="primary" disabled={busy || !status.sharePointConfigured} onClick={save}>
                {status.sharePointConfigured
                  ? busy ? 'Saving…' : 'Save PDF + photos to SharePoint'
                  : 'SharePoint connection pending'}
              </button>
            </div>

            {exported && (
              <div className="clearPanel">
                <div>
                  <strong>Finished with this excursion?</strong>
                  <p>Clear the photos, captions, notes and generated article currently held by the app on this device.</p>
                </div>
                <button className="danger" type="button" onClick={clearDeviceData}>Delete active data from device</button>
              </div>
            )}

            <p className="privacyNote">
              Clearing removes the active data held by this web app. For security reasons, a browser cannot delete original photos from your Photos library or a PDF you have chosen to save in Downloads/Files.
            </p>
          </div>
        )}

        {msg && <p className="message">{msg}</p>}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
