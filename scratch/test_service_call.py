import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
load_dotenv("backend/.env")

from backend.api.services import sarvam_service as sarvam

async def main():
    print("sarvam.is_available():", sarvam.is_available())
    reply = await sarvam.chat_json(
        system='Extract destination as JSON: {"destination": "string"}',
        user='Drive to Lonavala with 50% battery',
    )
    print("sarvam_service.chat_json response:", reply)

if __name__ == "__main__":
    asyncio.run(main())
