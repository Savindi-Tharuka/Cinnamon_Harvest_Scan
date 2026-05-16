# Expo React Native App

Cross-platform mobile app (Android + iOS) for cinnamon stem capture, analysis, and history tracking.

## Prerequisites
- Node.js 18+
- Android Studio emulator and/or iOS simulator

## API Base URL
Create `.env` from the template:

```powershell
Copy-Item .env.example .env
```

Set `EXPO_PUBLIC_API_BASE_URL`:
- Default (already configured): `http://207.180.201.192:8010`
- Optional override: `http(s)://<your-server-host>`

## Install and run
```powershell
npm install
npm run android
```

If you change `.env`, restart Expo so the new API URL is picked up.

Other options:
```powershell
npm run ios
npm run start
npm run web
```

## Implemented flow
1. Home page with 4 buttons (1 active tool + 3 disabled Coming Soon).
2. Tools page with:
   - Upload Image
   - Scan Stem (routes to Tips)
3. Tips page with guided capture instructions + Scan Now button.
4. Camera page with in-app camera, framing guidance, and photo capture.
5. Preview page with Retake / Continue.
6. Result page with skeleton loading, then result details and Save / Discard actions.
7. History page with:
   - Status filter
   - Analyzed date range filter
   - Infinite scroll pagination
   - Open result and Delete actions per record
