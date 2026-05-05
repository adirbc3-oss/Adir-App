import requests
import json

URL = "https://mspejiongrdsgbqomewj.supabase.co"
KEY = "sb_publishable_-_DqtXu-GQ97LecbJgLgqw_ADU_ZMzG"
headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json"
}

def check_table():
    print(f"Connecting to {URL}...")
    try:
        resp = requests.get(f"{URL}/rest/v1/PreciosCype?limit=5", headers=headers)
        print(f"Status: {resp.status_code}")
        print(f"Content: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_table()
