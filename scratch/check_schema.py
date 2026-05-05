import requests
import os

URL = "https://mspejiongrdsgbqomewj.supabase.co"
KEY = "sb_publishable_-_DqtXu-GQ97LecbJgLgqw_ADU_ZMzG"
headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json"
}

def get_schema():
    resp = requests.get(f"{URL}/rest/v1/PreciosCype?limit=1", headers=headers)
    if resp.status_code == 200:
        print(resp.json())
    else:
        print(f"Error: {resp.status_code} - {resp.text}")

if __name__ == "__main__":
    get_schema()
