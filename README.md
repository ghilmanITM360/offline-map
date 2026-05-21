# Karachi Ijtema Offline Navigation

Offline-first React Native app for internal walking navigation inside the Karachi Ijtema ground.

## Key Environment Variables

This project uses these public Expo variables:

```bash
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=your_android_maps_key_here
EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY=your_ios_maps_key_here
```

Android and iOS keys are separate. Do not reuse Android key for iOS unless you intentionally configured both platforms that way.

## Google Maps Setup (Android)

The Android app package is:

`com.aicrafted.karachiijtema`

Use this debug SHA-1 fingerprint for your development key restriction:

`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

Google Cloud requirements:

1. Required API: `Maps SDK for Android`
2. Application restriction: `Android apps`
3. API restriction: `Maps SDK for Android`
4. Add package name: `com.aicrafted.karachiijtema`
5. Add debug SHA-1 listed above
6. After editing restrictions, click `Done` and `Save`
7. Allow a few minutes for restrictions to propagate

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file from the example:

```bash
cp .env.example .env
```

3. Edit `.env` and set your real keys:

```bash
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=your_key_here
EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY=your_key_here
```

Developer note: paste your real Android key manually in `.env`, for example:

```bash
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY=MY_REAL_KEY
```

## Run Development Server

```bash
npx expo start -c
```

## Important: Expo Go vs Native Dev Build

Google Maps native API key injection is a native config concern. Key changes should not be expected to apply via JS hot reload alone.

After key or native config changes, rebuild Android:

```bash
npx expo prebuild --clean
npx expo run:android
```

If you use EAS development builds:

```bash
eas build --profile development --platform android
```

## Verification Checklist for Key Changes

1. `.env` exists in project root and includes `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY`
2. Metro restarted with `npx expo start -c`
3. Native Android app rebuilt after key/restriction changes
4. Google Cloud package + SHA-1 restrictions match this README exactly
