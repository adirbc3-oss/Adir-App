import requests
import json

URL = "https://mspejiongrdsgbqomewj.supabase.co"
KEY = "sb_publishable_-_DqtXu-GQ97LecbJgLgqw_ADU_ZMzG"
headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def fix_database_sync():
    # 1. Obtener 100 partidas de la base maestra CYPE
    print("Obteniendo datos de PreciosCype...")
    resp = requests.get(f"{URL}/rest/v1/PreciosCype?limit=100", headers=headers)
    if resp.status_code != 200:
        print(f"Error al leer CYPE: {resp.text}")
        return
    
    precios_master = resp.json()
    print(f"Encontradas {len(precios_master)} partidas maestras.")

    # 2. Preparar los registros para el borrador 'MURCIA_2026'
    # Mapeamos 'precio_total' a 'precio_base_estimado'
    partidas_para_borrador = []
    for p in precios_master:
        codigo = p['codigo']
        partidas_para_borrador.append({
            "id": f"MURCIA_2026-{codigo}",
            "propuesta_id": "MURCIA_2026",
            "texto_partida": f"{codigo}::{p['descripcion_corta']}",
            "precio_base_estimado": p['precio_total'],
            "cantidad": 1,
            "estado_adjudicacion": "Pendiente"
        })

    # 3. Subir a la tabla 'partidas'
    print(f"Subiendo {len(partidas_para_borrador)} partidas al borrador 'MURCIA_2026'...")
    resp_post = requests.post(f"{URL}/rest/v1/partidas?on_conflict=id", 
                             headers={**headers, "Prefer": "resolution=merge-duplicates"}, 
                             json=partidas_para_borrador)
    
    if resp_post.status_code in [200, 201, 204]:
        print("¡ÉXITO! Los Borradores deberían mostrar ahora las partidas.")
    else:
        print(f"Error al subir partidas: {resp_post.text}")

if __name__ == "__main__":
    fix_database_sync()
