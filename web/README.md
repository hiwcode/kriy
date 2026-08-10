# KRIY Web

The Next.js interface for KRIY, an AI agent control plane that turns product events into governed agent work.

## Development

Install dependencies and start the frontend:

```bash
npm install
npm run dev
```

Open [http://localhost:3004](http://localhost:3004).

The application uses locally bundled Onest Variable and JetBrains Mono Variable fonts, so builds do not depend on Google Fonts.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```

## Deploy on Vercel

Run deployment commands from this directory so the CLI uses the frontend project link:

```bash
vercel --prod
```
