import csv
import os

BC3_PATH = r"c:\Users\ocanovas\Desktop\Cheques 2026\ADIR\Codigo\n8n-reformas\App_React\Base_Precios_Centro_2004 (1).bc3"
CSV_OUTPUT = r"c:\Users\ocanovas\Desktop\Cheques 2026\ADIR\Codigo\n8n-reformas\App_React\Base_Precios_Centro_Final.csv"

def parse_date(date_str):
    if len(date_str) == 6:
        try: return f"20{date_str[4:]}-{date_str[2:4]}-{date_str[0:2]}"
        except: return None
    return None

def run_conversion():
    precios_base = {} 
    conceptos = {} 
    desc_largas = {} 
    descomposiciones = {} 
    tags_dict = {}
    meta = {}
    
    print("Leyendo archivo BC3...")
    with open(BC3_PATH, 'r', encoding='cp1252', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            parts = line.split('|')
            prefix = parts[0]

            if prefix == '~C':
                cod = parts[1].strip()
                unidad = parts[2].strip() if len(parts) > 2 else ""
                desc = parts[3].strip() if len(parts) > 3 else ""
                try: p = float(parts[4].replace(',', '.')) if parts[4] else 0.0
                except: p = 0.0
                fecha = parse_date(parts[5]) if len(parts) > 5 else None
                tipo_num = parts[6] if len(parts) > 6 else ""
                
                conceptos[cod] = {'unidad': unidad, 'desc': desc}
                precios_base[cod] = p
                meta[cod] = {'fecha': fecha, 'tipo_num': tipo_num}
            
            elif prefix == '~T':
                if len(parts) >= 3: desc_largas[parts[1].strip()] = parts[2].strip()
                    
            elif prefix == '~D':
                if len(parts) >= 3:
                    padre = parts[1].strip()
                    hijos_raw = parts[2].strip().split('\\')
                    h_list = []
                    # El formato suele ser Codigo\Factor\Rendimiento (3 campos)
                    # O Codigo\Rendimiento (2 campos) dependiendo de la version.
                    # Probamos con 3 campos primero que es lo normal en 2004.
                    step = 3 if len(hijos_raw) % 3 == 0 or (len(hijos_raw) > 3 and hijos_raw[1].isdigit()) else 2
                    for i in range(0, len(hijos_raw)-1, step):
                        try:
                            c_cod = hijos_raw[i]
                            # El rendimiento suele ser el ultimo valor del grupo
                            c_rend = float(hijos_raw[i + (step-1)].replace(',', '.'))
                            h_list.append((c_cod, c_rend))
                        except: continue
                    descomposiciones[padre] = h_list
            
            elif prefix == '~A':
                if len(parts) >= 3: tags_dict[parts[1].strip()] = parts[2].strip().replace('\\', ', ')

    print("Calculando desgloses reales...")
    with open(CSV_OUTPUT, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = ['codigo', 'categoria', 'unidad', 'descripcion_corta', 'descripcion_detallada', 
                      'mano_de_obra', 'maquinaria', 'materiales_y_otros', 'precio_total', 
                      'tags', 'tipo', 'fecha']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        
        cat_stack = ["General"]
        
        for cod, info in conceptos.items():
            # FILTRO: No incluir codigos auxiliares o de sistema en el CSV final
            if cod.startswith('%') or not info['desc'] or info['desc'] == "Medios auxiliares":
                continue
                
            is_cap = cod.endswith('#')
            if is_cap:
                cat_stack.append(info['desc'])
                tipo = "Capítulo"
            else:
                tipo = "Partida" if cod in descomposiciones else "Básico"

            # Calcular desgloses sumando hijos
            mo, maq, mat_otros = 0.0, 0.0, 0.0
            if cod in descomposiciones:
                for h_cod, rend in descomposiciones[cod]:
                    h_p = precios_base.get(h_cod, 0.0)
                    total_hijo = h_p * rend
                    if h_cod.startswith('O'): mo += total_hijo
                    elif h_cod.startswith('M'): maq += total_hijo
                    else: mat_otros += total_hijo
                
                precio_final = mo + maq + mat_otros
            else:
                # Si es un basico sin hijos, se asigna segun su codigo
                precio_final = precios_base.get(cod, 0.0)
                if cod.startswith('O'): mo = precio_final
                elif cod.startswith('M'): maq = precio_final
                else: mat_otros = precio_final

            # Solo guardamos si tiene precio o es un capitulo util
            if precio_final > 0 or is_cap:
                writer.writerow({
                    'codigo': cod,
                    'categoria': cat_stack[-2] if len(cat_stack) > 1 else "Raíz",
                    'unidad': info['unidad'],
                    'descripcion_corta': info['desc'],
                    'descripcion_detallada': desc_largas.get(cod, info['desc']),
                    'mano_de_obra': round(mo, 2),
                    'maquinaria': round(maq, 2),
                    'materiales_y_otros': round(mat_otros, 2),
                    'precio_total': round(precio_final, 2),
                    'tags': tags_dict.get(cod, ""),
                    'tipo': tipo,
                    'fecha': meta.get(cod, {}).get('fecha', '')
                })

    print(f"Procesado completado. Archivo limpio: {CSV_OUTPUT}")

if __name__ == "__main__":
    run_conversion()
