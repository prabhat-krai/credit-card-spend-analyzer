# 💳 Credit Card Spend Analyzer

> Built with [Antigravity](https://antigravity.dev) & Gemini 3.1 Pro 🚀

A CLI tool that extracts and categorizes debit transactions from credit card PDF statements using a multimodal LLM. Point it at a statement, and it gives you a spend breakdown by category and merchant — no manual data entry needed.

## How It Works

1. **PDF → Images** — The PDF statement is converted page-by-page into images (handles password-protected PDFs).
2. **Images → LLM** — All page images are sent to `google/gemini-3.5-flash` via [OpenRouter](https://openrouter.ai/) as a multimodal prompt.
3. **LLM → Structured Data** — The LLM extracts every debit transaction with date, merchant, amount, and an auto-assigned category.
4. **Summary** — A category-wise and merchant-wise spend summary is printed to the console.

## Prerequisites

- **Python 3.10+**
- **Poppler** — required by `pdf2image` for PDF-to-image conversion
  ```bash
  # macOS
  brew install poppler

  # Ubuntu / Debian
  sudo apt-get install poppler-utils
  ```
- **OpenRouter API Key** — sign up at [openrouter.ai](https://openrouter.ai/) and grab an API key

## Setup

```bash
# Clone the repo
git clone <your-repo-url>
cd credit-card-spend-analyzer

# Create a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure your API key
cp .env.example .env
# Edit .env and paste your OpenRouter API key
```

## Usage

### 🌐 Interactive Web Dashboard (Recommended)

Start the local web server and open the dashboard in your browser:
```bash
python src/main.py
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** to access the premium interactive interface where you can:
- **Drag & Drop** statements to parse them using Gemini.
- **Visualize** spending breakdown and timelines with interactive Chart.js charts.
- **Edit Details Inline** — correct merchant names and categories on the fly, with instant chart recalculation.
- **Search & Filter** transactions by merchant query or category.
- **Export** your curated transaction lists as CSV or JSON.

### 💻 Command Line Interface

If you prefer extracting data directly to the terminal:
```bash
python src/main.py -s <path-to-statement.pdf> [-p <password>]
```

| Argument | Required | Description |
|----------|----------|-------------|
| `-s`, `--statement` | No | Path to the credit card PDF statement (if omitted, launches Web UI) |
| `-p`, `--password` | No | Password to decrypt a protected PDF |
| `-w`, `--web` | No | Explicitly launch the Web App Dashboard interface |

### Examples

```bash
# Launch interactive Web Dashboard (same as running python src/main.py)
python src/main.py --web

# Process PDF in CLI directly
python src/main.py -s ~/Downloads/HDFC_FEB.pdf
```

### Sample Output

```
Credit Card Spend Analyzer Started...
Reading: statement_feb.pdf
Sending 3 pages to google/gemini-3.5-flash via OpenRouter...
-> Extracted 18 debit transactions.

Found 18 total spends.

--- Summary by Category ---
category
ecommerce        Rs. 8,450.00
food             Rs. 5,230.50
travel           Rs. 4,800.00
utilities        Rs. 3,150.00
entertainment    Rs. 2,499.00
shopping         Rs. 1,899.00
other              Rs. 750.00

--- Summary by Merchant (Top 10) ---
merchant
Flipkart Online        Rs. 5,200.00
Swiggy Delivery        Rs. 3,480.50
Cleartrip Travel       Rs. 2,800.00
Netflix Subscription   Rs. 2,499.00
IRCTC Booking          Rs. 2,000.00
Jio Prepaid            Rs. 1,950.00
Myntra Fashion         Rs. 1,899.00
Amazon Fresh           Rs. 1,750.00
Zomato Order           Rs. 1,750.00
Electricity Bill       Rs. 1,200.00
```

## Transaction Categories

The LLM auto-assigns one of these categories to each transaction:

`ecommerce` · `food` · `grocery` · `petrol` · `travel` · `entertainment` · `utilities` · `health` · `shopping` · `other`

## Project Structure

```
credit-card-spend-analyzer/
├── src/
│   ├── main.py           # CLI entrypoint & web launcher logic
│   └── web/
│       ├── server.py     # FastAPI backend serving API endpoints & static files
│       └── static/       # Frontend assets
│           ├── index.html# Dashboard markup
│           ├── styles.css# Dark theme custom glassmorphism styles
│           └── app.js    # State management, editing logic, exports, Chart.js
├── .env.example          # Template for environment variables
├── .gitignore            # Ignores .env, PDFs, CSVs, venv, temp_uploads
├── requirements.txt      # Python dependencies
└── README.md
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `pdf2image` | Converts PDF pages to images |
| `pypdf` | Reads and decrypts password-protected PDFs |
| `requests` | HTTP calls to OpenRouter API |
| `pandas` | Aggregation and summary tables |
| `python-dotenv` | Loads API key from `.env` |
| `fastapi` | High performance web server framework |
| `uvicorn` | ASGI server implementation to run FastAPI |
| `python-multipart` | Handles multipart form-data (PDF file uploads) |

## Notes

- The tool only extracts **debit** transactions — credits, payments, and fee reversals are ignored.
- Accuracy depends on the LLM's ability to read the statement images. DPI is set to 150; for very dense statements you may need to adjust this in the code.
- All API calls use OpenRouter's **zero-data-retention** (`zdr`) mode — your statement images are only routed to inference endpoints that do not store any request data.

