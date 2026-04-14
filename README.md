# Hotel Rate Filler — Chrome Extension

Auto-fill hotel room rates from an uploaded rate sheet image directly into your Property Management System.

---

## Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the `hotel-rate-filler` folder
5. The extension icon will appear in your Chrome toolbar

---

## First-Time Setup

1. Click the extension icon → click the ⚙ gear icon (Settings)
2. Enter your **Anthropic API Key** (starts with `sk-ant-`)
3. Click **Save Key**

> Get your API key at: https://console.anthropic.com/

---

## How to Use

### Step 1 — Rate Sheet Tab
1. Click the extension icon
2. Drag & drop or browse your rate sheet **image** (PNG, JPG, etc.)
3. Click **Extract Rates with AI** — Claude reads the table automatically
4. Review the extracted rates in the table
5. (Optional) Click **Edit** to manually correct any values
6. Click **✓ Use These Rates** to save and switch to Fill Form tab

### Step 2 — Fill Form Tab
1. Select the **Time Slot** (2H, 3H, 6H, 10H, 10H ONP, 12H, 24H)
2. Select the **Room Type** from the dropdown
3. The rate preview shows what will be filled
4. Choose fill options:
   - **Fill all days** = fills Mon–Sun adult columns (uncheck to fill Monday only)
   - **Fill Base, Single, Double, Triple rows** = fills all main rate rows
5. Navigate to your PMS form in the current tab
6. Click **Fill Form on Page**

---

## How It Fills

The extension locates your room type section on the page by searching for the room type name, then fills:
- **Adult columns** only (skips Ex. Child / 0.000 columns)
- Rows: Base(0), Single, Double, Triple
- Triggers `input`, `change`, and `blur` events so the form registers the new values

---

## Rate Sheet Format

Your image should contain a table like:

| LOS        | 2   | 3    | 6    | 10   | 10 ONP | 12   | 24   |
|------------|-----|------|------|------|--------|------|------|
| Executive  | 855 | 1120 | 1585 | 1775 | —      | 2030 | 2725 |
| Regency    | 715 | 940  | 1135 | 1325 | —      | 1580 | 2475 |
| ...        |     |      |      |      |        |      |      |

Claude AI will automatically read room names and rates from photos — even slightly blurry or skewed images.

---

## Tips

- **Rates persist** between sessions — you only need to upload once
- Use **Edit** in the Rate Sheet tab to manually fix misread values
- If the auto-fill misses fields, use your PMS's built-in **Copy All** button after filling the first column
- The extension works on any webpage — navigate to your PMS before clicking Fill

---

## Privacy
- Your API key is stored locally in Chrome storage only
- Images are sent to Anthropic's Claude API for text extraction only
- No data is stored or transmitted elsewhere
# AutoFillHLXRATES
