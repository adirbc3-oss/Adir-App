import requests
import re
import sys

# Configuración de Supabase
URL = "https://mspejiongrdsgbqomewj.supabase.co"
KEY = "sb_publishable_-_DqtXu-GQ97LecbJgLgqw_ADU_ZMzG"
headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

BC3_PATH = r"c:\Users\ocanovas\Desktop\Cheques 2026\ADIR\Codigo\n8n-reformas\App_React\Base_Precios_Centro_2004 (1).bc3"

def parse_and_upload():
    print(f"Abriendo archivo: {BC3_PATH}")
    conceptos = {}
    
    # Expresión regular para capturar la línea de concepto ~C
    # ~C|codigo|unidad|descripcion|precio|...
    
    try:
        with open(BC3_PATH, 'r', encoding='cp1252', errors='replace') as f:
            for line in f:
                if line.startswith('~C'):
                    parts = line.strip().split('|')
                    if len(parts) >= 5:
                        codigo = parts[1].strip()
                        unidad = parts[2].strip()
                        desc = parts[3].strip()
                        try:
                            precio = float(parts[4].replace(',', '.'))
                        except:
                            precio = 0
                        
                        # Solo guardamos si tiene precio y descripción
                        if codigo and desc and precio > 0:
                            conceptos[codigo] = {
                                "codigo": codigo,
                                "unidad": unidad,
                                "descripcion_corta": desc,
                                "precio_total": precio,
                                "categoria": "Base Centro 2004"
                            }
                
                # Opcional: ~T para descripciones largas si fuera necesario
                # Pero para estimación rápida, la corta suele bastar.

        print(f"Total conceptos encontrados con precio: {len(conceptos)}")
        
        # Subir en lotes a Supabase (tabla PreciosCype o una nueva)
        # Vamos a intentar subir a PreciosCype pero marcando la categoría
        
        lote = []
        contador = 0
        total_subidos = 0
        
        for cod, data in conceptos.items():
            lote.append(data)
            contador += 1
            
            if len(lote) >= 100:
                resp = requests.post(f"{URL}/rest/v1/PreciosCype", headers=headers, json=lote)
                if resp.status_code in [200, 201, 204]:
                    total_subidos += len(lote)
                    print(f"Progreso: {total_subidos} registros subidos...")
                else:
                    print(f"Error subiendo lote: {resp.text}")
                lote = []
                
        # Subir resto
        if lote:
            requests.post(f"{URL}/rest/v1/PreciosCype", headers=headers, json=lote)
            total_subidos += len(lote)
            
        print(f"¡FINALIZADO! Se han incorporado {total_subidos} precios a la base de datos.")

    except Exception as e:
        print(f"Error crítico: {e}")

if __name__ == "__main__":
    parse_and_upload()
