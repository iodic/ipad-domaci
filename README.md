# iPad domaći photos

A deliberately simple, JavaScript-free photo gallery for an iPad 1. The generated pages contain only static HTML and CSS.

## Add photos

Copy files into one of these local inboxes:

- `photo-src/luka/`
- `photo-src/vanja/`

Supported formats are HEIC, HEIF, JPG, JPEG, and PNG.

The processor groups photos using each source file's macOS creation date. All photos created on the same day appear on one dated page for that person.

- HEIC/HEIF originals are converted to JPG at quality 85.
- JPG, JPEG, and PNG originals are copied byte-for-byte without resizing.
- A separate thumbnail, at most 360 pixels on its longest side, is generated for gallery pages.
- Everything in `photo-src/` is ignored by Git and is never published.
- Web-ready images are written to `public/photos/` and committed.

Process the inboxes once:

```sh
npm run photos:process
```

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

The Mac only needs to be awake while receiving and publishing new photos. Vercel continues serving the existing gallery while the Mac is asleep.

## Develop and build

```sh
npm install
npm run dev
npm run build
```

Astro writes the built site to `dist/`. That directory is not committed. The generated images under `public/photos/` are committed so Vercel can include them in each build.

There is no browser-side JavaScript. Clicking a thumbnail opens the image file directly; use the browser's Back button to return to the dated page.

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Use the detected Astro settings (`npm run build`, output directory `dist`).
4. Add the chosen `iodicdesign.com` subdomain in the Vercel project's domain settings.
5. Point that subdomain's DNS record to the value Vercel provides.

The deployed gallery is intentionally public.

## Old iPad HTTPS compatibility

The site itself targets old Safari, but an iPad 1 may reject Vercel's modern TLS ciphers or certificate chain before loading the HTML. Test the Vercel deployment on the device. If HTTPS fails, place the custom subdomain behind Cloudflare with legacy browser TLS compatibility, or use a host that still accepts the iPad's TLS capabilities.
