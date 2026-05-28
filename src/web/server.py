import os
import shutil
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Import processing logic and key status from main
from src.main import process_statement, OPENROUTER_API_KEY
# Import database helpers
from src.web import db

app = FastAPI(title="Credit Card Spend Analyzer")

# Create temporary upload folder inside the workspace directory
TEMP_DIR = Path(__file__).resolve().parent.parent.parent / "temp_uploads"
TEMP_DIR.mkdir(exist_ok=True)

class CardCreate(BaseModel):
    name: str

class TransactionUpdate(BaseModel):
    merchant: Optional[str] = None
    category: Optional[str] = None

@app.get("/api/status")
def get_status():
    return {
        "status": "ok",
        "api_key_set": bool(OPENROUTER_API_KEY)
    }

# Cards API
@app.get("/api/cards")
def list_cards():
    return db.get_cards()

@app.post("/api/cards")
def create_card(card: CardCreate):
    name = card.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Card name cannot be empty.")
    return db.add_card(name)

@app.post("/api/demo")
def load_demo():
    card = db.add_card("Demo Premium Visa")
    existing = db.get_transactions(card_id=str(card["id"]))
    if not existing:
        demo_txs = [
            { "date": "2026-05-10", "merchant": "Amazon Online Shop", "amount": 4500.00, "category": "ecommerce" },
            { "date": "2026-05-11", "merchant": "Zomato Delivery", "amount": 850.50, "category": "food" },
            { "date": "2026-05-11", "merchant": "Swiggy Instamart", "amount": 1200.00, "category": "grocery" },
            { "date": "2026-05-12", "merchant": "HP Fuel Station", "amount": 2500.00, "category": "petrol" },
            { "date": "2026-05-14", "merchant": "Netflix Subscription", "amount": 649.00, "category": "entertainment" },
            { "date": "2026-05-14", "merchant": "Zara Retail Store", "amount": 3499.00, "category": "shopping" },
            { "date": "2026-05-15", "merchant": "Uber Ride", "amount": 450.00, "category": "travel" },
            { "date": "2026-05-16", "merchant": "MakeMyTrip Flight", "amount": 7800.00, "category": "travel" },
            { "date": "2026-05-18", "merchant": "Tata Power Utilities", "amount": 1850.00, "category": "utilities" },
            { "date": "2026-05-19", "merchant": "Apollo Pharmacy", "amount": 620.00, "category": "health" },
            { "date": "2026-05-20", "merchant": "Swiggy Delivery", "amount": 540.00, "category": "food" },
            { "date": "2026-05-21", "merchant": "Jio Mobile Recharge", "amount": 899.00, "category": "utilities" },
            { "date": "2026-05-22", "merchant": "Amazon Prime", "amount": 299.00, "category": "entertainment" },
            { "date": "2026-05-24", "merchant": "BigBasket Grocery", "amount": 2150.00, "category": "grocery" },
            { "date": "2026-05-25", "merchant": "Starbucks Coffee", "amount": 380.00, "category": "food" },
            { "date": "2026-05-26", "merchant": "HDFC Insurance Premium", "amount": 12000.00, "category": "other" }
        ]
        db.add_transactions(card["id"], demo_txs)
    return {"status": "success", "card_id": card["id"]}

# Months API
@app.get("/api/months")
def list_months():
    return db.get_distinct_months()

# Transactions API
@app.get("/api/transactions")
def list_transactions(card_id: str = "all", month: str = "all"):
    return db.get_transactions(card_id, month)

@app.put("/api/transactions/{tx_id}")
def update_tx(tx_id: int, tx_data: TransactionUpdate):
    success = db.update_transaction(tx_id, tx_data.merchant, tx_data.category)
    if not success:
        raise HTTPException(status_code=404, detail="Transaction not found or no update needed.")
    return {"status": "success"}

@app.delete("/api/transactions/{tx_id}")
def delete_tx(tx_id: int):
    success = db.delete_transaction(tx_id)
    if not success:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return {"status": "success"}

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    card_id: int = Form(...),
    password: Optional[str] = Form(None)
):
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not set in the environment or .env file."
        )
    
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Save uploaded file temporarily in the workspace temp directory
    temp_file_path = TEMP_DIR / file.filename
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Process the statement using the existing logic
        transactions = process_statement(temp_file_path, password)
        
        # Clean up temporary file
        if temp_file_path.exists():
            os.remove(temp_file_path)
            
        if not transactions:
            raise HTTPException(
                status_code=422,
                detail="No transactions extracted. Please check the PDF password and file contents."
            )
            
        # Insert extracted transactions into the database
        db.add_transactions(card_id, transactions)
        
        # Return all transactions matching the card so the UI displays them
        return {"filename": file.filename, "transactions": db.get_transactions(card_id=str(card_id))}

    except Exception as e:
        # Clean up just in case
        if temp_file_path.exists():
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files folder
static_path = Path(__file__).resolve().parent / "static"
static_path.mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=str(static_path), html=True), name="static")
