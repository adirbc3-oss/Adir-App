import requests
import json

URL = "https://mspejiongrdsgbqomewj.supabase.co"
KEY = "sb_publishable_-_DqtXu-GQ97LecbJgLgqw_ADU_ZMzG"

headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def check_proveedores():
    print("Checking table 'proveedores'...")
    # Try to fetch one row to see columns
    resp = requests.get(f"{URL}/rest/v1/proveedores?limit=1", headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        if data:
            print("Row data:", json.dumps(data[0], indent=2))
        else:
            print("Table is empty.")
    else:
        print(f"Error fetching: {resp.status_code} - {resp.text}")

if __name__ == "__main__":
    check_proveedores()
