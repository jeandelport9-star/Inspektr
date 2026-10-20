# Inspektr

Walk, talk and get a signed inspection report before you leave the property.

Inspektr is a phone-first web app for rental inspections. The inspector films one walk-through
and narrates it. Voice commands (or taps) take photos and rate items, and the app turns the walk
into an ingoing, outgoing, routine or inventory report with defects pinned on a floor plan.
Defects become repair jobs automatically.

This is a working prototype: everything runs in the browser and data stays on the device.

## Run it in VS Code

1. Open this folder in VS Code.
2. Install the recommended **Live Server** extension when prompted.
3. Click **Go Live** in the status bar. The app opens at `http://127.0.0.1:5500`.

Camera and microphone work on `localhost`. To test on your phone, use the GitHub Pages link below
(phones need HTTPS for the camera).

No build step and no install: plain HTML, CSS and JavaScript modules.

## Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Inspektr prototype"
git branch -M main
git remote add origin https://github.com/<your-user>/inspektr.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
branch `main`, folder `/ (root)`. The app goes live at `https://<your-user>.github.io/inspektr/`
after a minute or two. The empty `.nojekyll` file makes Pages serve the files as they are.

## Try the flow

1. **Portfolio**: tap a house on the map. The map flies in and the floor plan draws itself with
   the defect pins.
2. **Tap a pin** to see the photo, what the inspector said, and the repair status.
3. **Start inspection**, pick a property and type, then press **Start recording**.
4. Talk, or type in the box on desktop:
   - `new room kitchen`
   - `stove four plates good`
   - `tap at the sink is dripping defect` (adds a defect and takes a photo)
   - `inventory four dining chairs`
   - `take photo`, `note tenant has a dog`, `undo`, `finish inspection`
   - Or tap: shutter = photo, hold the shutter = defect photo, Good and Defect buttons.
   - Keyboard: <kbd>Space</kbd> photo, <kbd>D</kbd> defect, <kbd>G</kbd> good, <kbd>R</kbd> next room.
5. **Review**: only the items that need a decision are shown. Drag pins to move them.
6. **Sign-off**: tenant and agent sign on screen. Defects become repair jobs.
7. **Report**: print or save as PDF. Outgoing reports compare against the ingoing one and list
   deposit deductions.
8. **Repairs**: send a job to 3 contractors, choose a quote, add a completion photo.

**Reset demo data** is at the bottom of the Portfolio page.

## Browser support

| Feature | Chrome / Edge | Safari (iOS 14.5+) | Firefox |
| --- | --- | --- | --- |
| Video and photos | Yes | Yes | Yes |
| Voice commands | Yes | Yes | No (tap or type instead) |

Without a camera the app runs in demo mode with illustrated photos.

## What is simulated in this prototype

- **Transcription and report drafting** run in the browser with a rule-based parser of the
  narration, not a server-side AI model.
- **Pin positions** are spread inside the room you were in. Real indoor positioning needs AR
  tracking in a native app. Drag pins to correct them.
- **Contractor quotes** are sample data.
- **Data** is stored in this browser only (localStorage and IndexedDB). Clearing site data
  removes it.

## Project structure

```
index.html            App shell
css/inspektr.css      All styles (night blueprint + survey amber)
js/app.js             Routing and screens
js/voice.js           Voice commands and narration parser
js/recorder.js        Camera, continuous recording, still capture
js/floorplan.js       Blueprint floor plan and pins
js/demo.js            Demo portfolio and illustrated photos
js/store.js           localStorage records + IndexedDB media
js/ui.js              Helpers, icons, sounds, bottom sheet
vendor/               Leaflet 1.9.4 and the Archivo font (bundled, no CDN)
```

Map tiles: © OpenStreetMap contributors, © CARTO.
