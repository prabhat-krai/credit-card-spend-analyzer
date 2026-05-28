import os
import hashlib
from pathlib import Path
from typing import Dict, Any, List

from pypdf import PdfReader
from dotenv import load_dotenv

from src.main import process_statement
from src.web import db

# Load environment variables
load_dotenv()

# Target Folder
DROPBOX_DIR = Path.home() / "Downloads" / "cc_statements"

def ensure_dropbox_exists():
    DROPBOX_DIR.mkdir(parents=True, exist_ok=True)
    return DROPBOX_DIR

def compute_sha256(file_path: Path) -> str:
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        # Read in chunks of 4KB
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def get_decryption_passwords() -> List[str]:
    passwords_str = os.getenv("STATEMENT_PASSWORDS", "")
    if not passwords_str:
        return []
    # Split by comma and strip whitespaces
    return [p.strip() for p in passwords_str.split(",") if p.strip()]

def try_decrypt_pdf(file_path: Path) -> str:
    """
    Checks if a PDF is encrypted. If it is, tries to decrypt it using the list 
    of default passwords. Returns the working password, or empty string if it's 
    unencrypted, or None if decryption failed.
    """
    reader = PdfReader(str(file_path))
    
    # Check if encrypted (pypdf uses .is_encrypted attribute)
    is_encrypted = getattr(reader, "is_encrypted", False) or getattr(reader, "isEncrypted", False)
    if not is_encrypted:
        return "" # Unencrypted
        
    passwords = get_decryption_passwords()
    
    # Try each password in sequence
    for pwd in passwords:
        if reader.decrypt(pwd):
            return pwd
            
    return None # Failed to decrypt

def sync_dropbox() -> Dict[str, Any]:
    dropbox_dir = ensure_dropbox_exists()
    
    pdf_files = list(dropbox_dir.glob("*.pdf")) + list(dropbox_dir.glob("*.PDF"))
    
    results = {
        "processed_files": 0,
        "new_transactions": 0,
        "failed_files": 0,
        "details": []
    }
    
    for file_path in pdf_files:
        try:
            # 1. Compute checksum
            file_hash = compute_sha256(file_path)
            
            # 2. Skip if already processed
            if db.is_statement_processed(file_hash):
                continue
                
            # 3. Decrypt check
            decrypt_pwd = try_decrypt_pdf(file_path)
            if decrypt_pwd is None:
                print(f"Skipping encrypted file {file_path.name}: decryption password missing or incorrect.")
                results["failed_files"] += 1
                results["details"].append({
                    "filename": file_path.name,
                    "status": "error",
                    "reason": "decryption_failed"
                })
                continue
            
            # 4. Process statement via Gemini
            print(f"Syncing new statement: {file_path.name}...")
            # process_statement returns {"card_issuer": "...", "transactions": [...]} or None
            statement_data = process_statement(file_path, decrypt_pwd if decrypt_pwd else None)
            
            if not statement_data or not statement_data.get("transactions"):
                results["failed_files"] += 1
                results["details"].append({
                    "filename": file_path.name,
                    "status": "error",
                    "reason": "no_transactions_extracted"
                })
                continue
                
            transactions = statement_data["transactions"]
            card_issuer = statement_data.get("card_issuer", "Unknown Bank").strip()
            
            # 5. Get or create Card profile
            # Normalize bank name for matching (e.g. HDFC Bank -> HDFC Bank)
            card_profile = db.add_card(card_issuer)
            card_id = card_profile["id"]
            
            # 6. Save transactions to database
            db.add_transactions(card_id, transactions)
            
            # 7. Mark file as processed
            db.mark_statement_processed(file_hash, file_path.name, card_id)
            
            results["processed_files"] += 1
            results["new_transactions"] += len(transactions)
            results["details"].append({
                "filename": file_path.name,
                "status": "success",
                "card": card_issuer,
                "count": len(transactions)
            })
            
        except Exception as e:
            print(f"Error syncing file {file_path.name}: {e}")
            results["failed_files"] += 1
            results["details"].append({
                "filename": file_path.name,
                "status": "error",
                "reason": str(e)
            })
            
    return results
