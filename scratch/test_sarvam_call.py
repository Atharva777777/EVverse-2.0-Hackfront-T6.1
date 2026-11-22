import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env
load_dotenv(dotenv_path=Path(".env"))
load_dotenv(dotenv_path=Path("backend/.env"))

api_key = os.environ.get("SARVAM_API_KEY")
if not api_key:
    print("ERROR: SARVAM_API_KEY not found in environment.")
    sys.exit(1)

masked_key = f"{api_key[:6]}...{api_key[-4:]}"
print(f"Loaded SARVAM_API_KEY: {masked_key}")

from sarvamai import AsyncSarvamAI

async def main():
    print("Connecting to Sarvam AI with model 'sarvam-105b-conversations'...")
    client = AsyncSarvamAI(api_subscription_key=api_key)
    try:
        response = await client.chat.completions(
            model="sarvam-105b-conversations",
            messages=[
                {"role": "system", "content": "You are the EVverse AI Copilot. Keep responses under 20 words."},
                {"role": "user", "content": "Hello! Can you help me plan my EV journey?"}
            ],
            max_tokens=60,
            temperature=0.2,
        )
        choice = response.choices[0]
        content = choice.message.content
        print("\n=== SUCCESS: Working API Call Received ===")
        print(f"Model: {response.model if hasattr(response, 'model') else 'sarvam-105b-conversations'}")
        print(f"Response: {content.strip()}")
        print("==========================================\n")
    except Exception as exc:
        print(f"\nAPI Call Failed: {type(exc).__name__}: {exc}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
