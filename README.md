# iPad domaći photos

A deliberately simple, JavaScript-free photo gallery for an iPad 1. The generated pages contain only static HTML and CSS.

## Add photos

Copy files into one of these local inboxes:

- `photo-src/luka/`
- `photo-src/vanja/`

Supported formats are HEIC, HEIF, JPG, JPEG, and PNG.

The processor groups photos using each source file's macOS creation date. All photos created on the same day appear on one dated page for that person.

- Every photo, whatever its format, gets a levels and contrast pass so paper reaches white, pencil reaches black, and faint handwriting stays legible.
- HEIC/HEIF originals are converted to JPG at quality 88. JPG, JPEG, and PNG keep their format and full resolution.
- A separate thumbnail, at most 360 pixels on its longest side, is generated for gallery pages.
- Everything in `photo-src/` is ignored by Git and is never published.
- Web-ready images are written to `public/photos/` and committed.

Process the inboxes once:

```sh
npm run photos:process
```

Re-render everything, including photos already in `public/photos/`, after changing the enhancement settings:

```sh
npm run photos:reprocess
```

Output names come from a hash of the source file, so re-rendering overwrites images in place and existing gallery links keep working.

The pass needs ImageMagick (`brew install imagemagick`). Without it the processor falls back to `sips` and skips the enhancement. Set `PHOTO_ENHANCE=0` to turn the pass off; the settings themselves live in `enhanceArguments` in `scripts/process-photos.mjs`.

Watch continuously, then automatically commit and push new web-ready images after a five-second quiet period:

```sh
npm run photos:watch
```

Watch and process without committing or pushing:

```sh
npm run photos:watch:local
```

Files can remain in the inboxes. Output names contain a content hash, so restarting the watcher does not duplicate unchanged files.

## Start the watcher automatically on macOS

After the Git remote and push authentication work, install the included LaunchAgent:

```sh
npm run watcher:install
```

It starts at login, stays running while the Mac is awake, and processes waiting files after the Mac wakes. Logs are stored under `.logs/`.

Remove it with:

```sh
npm run watcher:uninstall
```

The Mac only needs to be awake while receiving and publishing new photos. GitHub Pages continues serving the existing gallery while the Mac is asleep.

## Develop and build

```sh
npm install
npm run dev
npm run build
```

Astro writes the built site to `dist/`. That directory is not committed. The generated images under `public/photos/` are committed, and GitHub Pages rebuilds the site after each push.

There is no browser-side JavaScript. Clicking a thumbnail opens the image file directly; use the browser's Back button to return to the dated page.

Every page includes a `noindex, nofollow, noarchive` robots directive. `robots.txt` also asks every crawler to stay out. These are requests honored by well-behaved search engines, not access controls.

## Hosting

The public `iodic/ipad-domaci` repository is built and hosted using GitHub Pages. HTTPS enforcement must remain disabled so the iPad 1 can use:

```text
http://dom.iodicdesign.com
```

The Cloudflare DNS record should be a DNS-only CNAME:

```text
dom -> iodic.github.io
```

The deployed gallery is intentionally public.
