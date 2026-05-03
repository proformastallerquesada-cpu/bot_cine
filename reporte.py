import pandas as pd
from sqlalchemy import create_engine
from datetime import datetime
import re

# CONEXIÓN
db_url = 'postgresql://postgres:12345@localhost:5432/bot_cine'

try:
    engine = create_engine(db_url)
    
    # CONSULTA A BASE DE DATOS
    query = """
    SELECT 
        r.nombre_cliente AS "Nombre del Cliente",
        r.cantidad_personas AS "Espacios",
        p.titulo AS "Película",
        split_part(p.horario, ' ', 1) AS "Día",
        replace(p.horario, split_part(p.horario, ' ', 1), '') AS "Tanda",
        r.telefono_cliente AS "Número de Teléfono"
    FROM reservas r
    JOIN peliculas p ON r.pelicula_id = p.id
    ORDER BY r.id DESC;
    """
    
    df = pd.read_sql(query, engine)

    # FUNCIÓN PARA LIMPIAR EL NÚMERO (SOLO DEJA LOS 8 DÍGITOS)
    def limpiar_numero(txt):
        # 1. Quita letras y símbolos, deja solo números
        solo_numeros = re.sub(r'\D', '', str(txt))
        # 2. Retorna los últimos 8
        return solo_numeros[-8:]

    df["Número de Teléfono"] = df["Número de Teléfono"].apply(limpiar_numero)

    # NOMBRE DE EXCEL DINÁMICO
    fecha_actual = datetime.now().strftime("%d-%m-%Y")
    nombre_excel = f"{fecha_actual}.xlsx"

    # GENERAR ARCHIVO Y AUTO-AJUSTAR CELDAS
    with pd.ExcelWriter(nombre_excel, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Reservas')
        
        hoja = writer.sheets['Reservas']
        for columna in hoja.columns:
            max_longitud = 0
            letra_columna = columna[0].column_letter
            
            for celda in columna:
                try:
                    if len(str(celda.value)) > max_longitud:
                        max_longitud = len(str(celda.value))
                except:
                    pass
            
            hoja.column_dimensions[letra_columna].width = max_longitud + 4

    print(f"✅ ¡Reporte impecable generado!: {nombre_excel}")

except Exception as e:
    print(f"❌ Error al generar reporte: {e}")