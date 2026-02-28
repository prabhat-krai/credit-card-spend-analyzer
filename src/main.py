import os
import sys
import argparse
import base64
import io
import json
import re

import pandas as pd
import requests
from pathlib import Path
from dotenv import load_dotenv
from pdf2image import convert_from_path, convert_from_bytes
from pypdf import PdfReader, PdfWriter

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
if not OPENROUTER_API_KEY:
    sys.exit("Error: OPENROUTER_API_KEY not set. Create a .env file.")

MODEL = "google/gemini-3-flash-preview"

def image_to_base64(image):
    buffered = io.BytesIO()
    image.save(buffered, format="JPEG", quality=85)
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

def process_statement(pdf_path: Path, pw: str = None):
    print(f"Reading: {pdf_path.name}")

    try:
        if pw:
            reader = PdfReader(str(pdf_path))
            if getattr(reader, "is_encrypted", False) or getattr(reader, "isEncrypted", False):
                if not reader.decrypt(pw):
                    print(f"Error: Incorrect password for {pdf_path.name}")
                    return []
                    
                writer = PdfWriter()
                for page in reader.pages:
                    writer.add_page(page)
                    
                pdf_bytes = io.BytesIO()
                writer.write(pdf_bytes)
                pdf_bytes.seek(0)
                images = convert_from_bytes(pdf_bytes.read(), dpi=150)
            else:
                images = convert_from_path(str(pdf_path), dpi=150)
        else:
            images = convert_from_path(str(pdf_path), dpi=150)
            
    except (OSError, RuntimeError, ValueError) as e:
        print(f"Error converting {pdf_path.name} to images: {e}")
        return []
    
    # Base64 encode images
    b64_images = [image_to_base64(img) for img in images]
    
    prompt = """You are a credit card statement analyzer. I am providing you with images of my credit card statement. 
Please extract all the DEBIT transactions (spends). Ignore any credit transactions, payments, or fee reversals. 
For each debit transaction, return a clean merchant name, the exact amount, the date (YYYY-MM-DD format), and pick a single 
suitable category like (ecommerce, food, grocery, petrol, travel, entertainment, utilities, health, shopping, other). 

Return the output strictly as a JSON array of objects. 
Example: [{"date": "2024-02-14", "merchant": "Amazon", "amount": 1499.00, "category": "ecommerce"}]
Only output the JSON block, nothing else."""

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt}
            ]
        }
    ]
    
    for b64 in b64_images:
        messages[0]["content"].append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{b64}"
            }
        })
        
    print(f"Sending {len(images)} pages to {MODEL} via OpenRouter...")
    try:
        response = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": MODEL,
                "messages": messages,
                "zdr": True
            },
            timeout=180
        )
        
        response.raise_for_status()
        data = response.json()

        if "choices" not in data or not data["choices"]:
            print(f"Unexpected API response: {data.get('error', data)}")
            return []

        content = data["choices"][0]["message"]["content"]
        
        # Clean up potential markdown code fences
        match = re.search(r'```(?:json)?\s*(.*?)```', content, re.DOTALL)
        if match:
            content = match.group(1).strip()
            
        # Parse JSON
        transactions = json.loads(content)
        
        # Add source file
        for t in transactions:
            t['source_file'] = pdf_path.name
            
        print(f"-> Extracted {len(transactions)} debit transactions.")
        return transactions
        
    except (requests.RequestException, json.JSONDecodeError, KeyError) as e:
        print(f"Error calling LLM for {pdf_path.name}: {e}")
        if 'response' in locals() and hasattr(response, 'text'):
             print(f"Response: {response.text}")
        return []

def main():
    parser = argparse.ArgumentParser(description="Credit Card Spend Analyzer (End-to-End LLM)")
    parser.add_argument("-s", "--statement", required=True, help="Path to the PDF statement")
    parser.add_argument("-p", "--password", default=None, help="Password for the PDF if it is protected")
    args = parser.parse_args()

    pdf_path = Path(args.statement)
    if not pdf_path.exists():
        print(f"File {pdf_path} does not exist.")
        return

    print("Credit Card Spend Analyzer Started...")
    
    all_transactions = process_statement(pdf_path, args.password)
        
    if not all_transactions:
        print("No transactions found or extraction failed.")
        return
        
    print(f"\nFound {len(all_transactions)} total spends.")

    df = pd.DataFrame(all_transactions)
    
    pd.options.display.float_format = 'Rs. {:,.2f}'.format
    
    print("\n--- Summary by Category ---")
    cat_summary = df.groupby("category")['amount'].sum().sort_values(ascending=False)
    print(cat_summary.apply(lambda x: f"Rs. {x:,.2f}"))
    
    print("\n--- Summary by Merchant (Top 10) ---")
    merch_summary = df.groupby("merchant")['amount'].sum().sort_values(ascending=False).head(10)
    print(merch_summary.apply(lambda x: f"Rs. {x:,.2f}"))
    
if __name__ == "__main__":
    main()

