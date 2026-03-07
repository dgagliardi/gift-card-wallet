# 💳 Universal Gift Card & Prepaid Wallet

A lightweight, mobile-friendly web app to securely track your physical and digital gift cards, prepaid cards, and store credits. 

Tired of juggling physical cards and trying to remember the remaining balances on your digital store credits? This tracker runs entirely within your own personal Google Account using Google Sheets and Google Apps Script, acting as a private digital wallet.

### ✨ Features
* **100% Private:** Your card numbers, PINs, and purchase history never leave your Google Account. There is no third-party database.
* **No App Store Needed:** Installs directly to your phone's home screen as a Progressive Web App (PWA).
* **Universal Tracking:** Add any brand (Costco, Starbucks, Home Depot, Visa Prepaid, etc.).
* **Instant Verification:** Add custom balance-check URLs for any store. Securely copy your card details and verify your exact balance with one tap.
* **Dynamic UI:** Generates clean, glossy digital cards natively in the browser. 

---

## 🛠️ Phase 1: Database Setup (Google Sheets)
Your Google Sheet acts as the secure, private database for your app. 

1. Go to Google Drive and create a new **Google Sheets** document. 
2. Name the document **Gift Card Tracker**.
3. At the bottom of the screen, double-click "Sheet1" and rename it to **Cards**.
4. Set up the exact column headers in row 1 of the **Cards** sheet (Columns A through J):
   * A1: `Card ID`
   * B1: `Brand`
   * C1: `Type`
   * D1: `Date Added`
   * E1: `Initial Balance`
   * F1: `Image URL`
   * G1: `Card Number`
   * H1: `PIN`
   * I1: `Check Balance URL`
   * J1: `Archived`

5. Click the **+** icon at the bottom left to create a second tab. Name it exactly: **Transactions**.
6. Set up the exact column headers in row 1 of the **Transactions** sheet (Columns A through E):
   * A1: `Date`
   * B1: `Card Id`
   * C1: `Amount Deducted`
   * D1: `Remaining Balance`
   * E1: `Note`

---

## ⚙️ Phase 2: App Logic Setup (Google Apps Script)
This is where we add the code that turns your spreadsheet into a mobile app. 

1. From your Google Sheet top menu, click **Extensions > Apps Script**. A new browser tab will open.
2. At the top left, click "Untitled project" and rename it to **Gift Card Wallet App**.
3. You will see a file named `Code.gs`. Delete all the default text inside it.
4. Copy all the text from the `Code.gs` file in this repository and paste it into your editor.
5. Next to the "Files" header on the left menu, click the **+** icon and select **HTML**.
6. Name this new file exactly: **Index** *(Note: it is case-sensitive, use a capital 'I')*.
7. Delete the default HTML code and paste all the text from the `Index.html` file in this repository.
8. Click the **Save** icon (floppy disk) at the top.

---

## 🚀 Phase 3: Deployment (Publishing the App)
Now we securely publish the code to your Google account so you can access it on your phone.

1. In the top right corner of the Apps Script editor, click the blue **Deploy** button and select **New deployment**.
2. Click the **Gear icon** next to "Select type" and check the box for **Web app**.
3. Fill out the configuration exactly like this:
   * **Description:** Wallet v1
   * **Execute as:** Me (your email)
   * **Who has access:** Only myself
4. Click **Deploy**.
5. **Authorization (Don't Panic!):** Google will ask for permission to let the script write to your Sheet. 
   * Click **Review permissions** and choose your Google account.
   * *Google will show a warning saying "Google hasn’t verified this app."* Because you are the one who literally just pasted the code, it is safe. 
   * Click **Advanced** at the bottom of the warning.
   * Click **Go to Gift Card Wallet App (unsafe)**.
   * Click **Allow**.
6. You will be presented with a **Web app URL**. Copy this link!

---

## 📱 Phase 4: Mobile Phone Setup
Get the app onto your home screen for easy access at the checkout register.

1. Send the **Web app URL** you just copied to your phone (via email, text, or a notes app).
2. Open the link in your mobile browser (Safari for iPhone, Chrome for Android).
3. **Save it as an app:**
   * **iPhone (Safari):** Tap the Share icon at the bottom, scroll down, and tap **Add to Home Screen**.
   * **Android (Chrome):** Tap the three-dot menu icon in the top right, and tap **Add to Home screen**.