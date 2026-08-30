# Finance Hub SMS Companion Android App

A lightweight, zero-battery background Android companion app that automatically captures Indian banking loan/EMI debit SMS and historical messages, forwarding them directly to your Finance Hub dashboard.

## 🌟 Key Features
- **Zero-Battery Background Listener**: Uses `BroadcastReceiver` (`SMS_RECEIVED_ACTION`) to capture new loan debits the second they arrive from banks (HDFC, SBI, ICICI, Canara, Axis, Bajaj, etc.).
- **1-Click Historical Backfill**: Queries `content://sms/inbox` for the past 12 months, extracts loan EMI messages, and batch-uploads them to your backend.
- **Strict Idempotency**: Raw messages are deduplicated using a SHA-256 fingerprint on the server (`raw_sms/{hash}`). Re-running backfills creates zero duplicate entries.
- **Decoupled Architecture**: Messages are stored in raw format and processed server-side via `smsSyncEngine.ts`.

## 🚀 How to Run in Android Studio
1. Open **Android Studio**.
2. Select **Open** and choose the `android/` directory in this repo (`/Users/tsanthosh/work/journal/android`).
3. If you have Firebase configured for Android, place your `google-services.json` inside `android/app/`.
4. Connect your Android phone via USB (or use an emulator).
5. Click **Run ▶️** (`app`).
6. On your phone, tap **"Grant SMS Access"**.
7. Tap **"Scan & Backfill Past 12 Months"** to backfill all past home loan payments into your dashboard!

## 📡 API Endpoint
- **URL**: `https://journal--track-everything-ai.us-east4.hosted.app/api/sync/sms`
- **Method**: `POST`
- **Payload**:
  ```json
  {
    "userId": "tsanthosh.online@gmail.com",
    "messages": [
      {
        "sender": "AD-HDFCBK",
        "body": "Dear Customer, INR 38,450.00 debited from A/C **1234 towards Home Loan A/C **7890 on 05-AUG-26.",
        "timestamp": 1788114475000
      }
    ]
  }
  ```
