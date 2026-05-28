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
# Import folder sync engine
from src.web import sync

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


# Months API
@app.get("/api/months")
def list_months():
    return db.get_distinct_months()

# Sync Downloads Folder API
@app.post("/api/sync")
def trigger_sync():
    try:
        sync_results = sync.sync_dropbox()
        return sync_results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
