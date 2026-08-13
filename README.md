# School Excursion Reporter V1.2

Mobile-first React/Vite + Node/Express prototype for capturing school excursion photos, photo captions and teacher notes, generating an AI-assisted excursion report, reviewing it, and later saving the approved PDF and photographs to SharePoint.

## What changed in V1.2

- Separate **Take Photo** and **Add Existing Photos** controls.
- `Take Photo` uses `capture="environment"` so supported iPhone/iPad browsers request the rear camera.
- Mobile layout has larger touch targets and iPhone safe-area support.
- Development frontend now runs over HTTPS so browser microphone APIs can be tested on mobile.
- The Vite dev server listens on the local network and proxies `/api` to the Node server, so the phone only needs one HTTPS address.
- The app displays whether the current browser is running in a secure context.

## Install

```bash
cp .env.example .env
npm install
npm run dev
```

On the Mac, Vite will show an HTTPS address such as:

```text
https://localhost:5173
```

The first visit may show a browser warning because the development certificate is self-signed. This certificate is for local testing only.

## Test from an iPhone/iPad on the same Wi-Fi

1. Make sure the Mac and iPhone/iPad are connected to the same Wi-Fi network.
2. Find the Mac's Wi-Fi IP address:

```bash
ipconfig getifaddr en0
```

If that returns, for example:

```text
192.168.1.42
```

open this on the iPhone/iPad in Safari:

```text
https://192.168.1.42:5173
```

3. Safari may warn that the local development certificate is not trusted. For basic local testing you can view the details and continue to the site. If Safari still refuses microphone access because the certificate is not trusted, use a locally trusted certificate (for example mkcert) or deploy the test build to an approved HTTPS development host.
4. Tap **Take Photo**. On supported iPhone/iPad browsers this should request the rear camera.
5. Tap **Add Existing Photos** to deliberately select from the photo library or Files.
6. Tap **Dictate note** and allow microphone access when prompted.

## Important mobile note

`capture="environment"` is a browser hint rather than an absolute command across every browser/OS combination. On current mobile Safari it is intended to offer direct camera capture, while desktop browsers commonly fall back to a file picker. The app therefore keeps **Take Photo** and **Add Existing Photos** as separate user choices.

## Current development mode

The app works without Microsoft configuration for:

- excursion details
- take/add photos with previews and captions
- typed notes
- microphone recording and AI transcription (requires `OPENAI_API_KEY`)
- AI excursion report generation and editing

SharePoint save remains disabled until Microsoft Entra and `SHAREPOINT_DRIVE_ID` are configured by school IT.

## Privacy architecture

The app does not intentionally store excursion content in localStorage, IndexedDB, an application database, or an uploads directory. Images and microphone audio are handled as browser/server memory objects for the active workflow. Browsers and operating systems can still perform transient internal caching, so this is not a forensic guarantee that no bytes are ever written by the device.

## Microsoft / SharePoint

When school IT creates the Entra app registration, fill in the Microsoft variables plus `SHAREPOINT_DRIVE_ID`. The app status endpoint will automatically enable Microsoft sign-in and SharePoint saving.
