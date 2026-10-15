# Glass Collection

A mobile-first PWA for a neighborhood glass-recycling pickup service: subscriber list, optimized pickup routes,
field check-off with photo proof, payments, helper pay, expenses, monthly statements and tax-ready reports.

One deployment = one family/business. To run your own, use this repo as a template and follow the setup below.

## What it does
- **Subscribers** grouped by **neighborhood** and **route** (split a neighborhood among helpers).
- **Plan a pickup day**: geocodes addresses, optimizes visiting order (Google Routes API, or a built-in optimizer when no key).
- **Collect screen** (helpers see only their routes): navigate, take a photo (time + GPS stamped), mark *Collected / Nothing out / Skip*. Works offline and syncs later.
- **History map**: stops colored by outcome, numbered in visit order, with photos.
- **Payments, expenses, helper payouts**, profit and loss, annual CSV/PDF.
- **Email** pickup notices (with the subscriber's own photos) and monthly statement PDFs.

## Setup
1. **Firebase** (free Spark plan): create a project, enable *Authentication* (Google and/or Email/Password) and *Firestore*.
   Add a Web app and copy the config into `.env.local` (see `.env.example`).
2. **Owner email**: edit `OWNER_EMAIL()` in `firestore.rules`, then deploy rules:
   `npm i -g firebase-tools && firebase login && firebase deploy --only firestore --project <your-project-id>`.
   That person's first verified sign-in becomes the owner. Others are invited from **Settings → Team**.
3. **Google Maps (optional)**: in a *separate* Google Cloud project with billing, enable Geocoding API and Routes API,
   create a key restricted by HTTP referrer, and set `VITE_GOOGLE_MAPS_KEY`. Without it the app uses OpenStreetMap
   geocoding and a local route optimizer.
4. **Hosting**: Cloudflare Pages → Connect to Git → build `npm run build`, output `dist`. Add the `VITE_*` variables.
   Add your Pages domain in Firebase Auth → Settings → Authorized domains.
5. **Email (optional)**: create a Resend account and verify a sender domain/address. In Pages add *encrypted* variables
   `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `FIREBASE_PROJECT_ID`, optional `DAILY_SEND_CAP`.
   The Function in `functions/api/send-email.ts` verifies the caller and only mails the subscriber's stored address.

## Develop
```bash
npm install
npm run dev     # needs .env.local
npm test        # billing, pay and route logic
npm run build
```

## Notes
- Photos are compressed in the browser and stored in Firestore (Firebase Storage needs the paid plan). Use *Remove old photos* on a pickup day to apply the retention setting.
- Reports are a bookkeeping aid, not tax advice.
- Never commit `.env.local` or API keys.
