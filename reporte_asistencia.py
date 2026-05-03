import pandas as pd
from sqlalchemy import create_engine
from datetime import datetime

# 1. CONEXIÓN A POSTGRESQL
db_url = 'postgresql://postgres:12345@localhost:5432/bot_cine'

try:
    engine = create_engine(db_url)
    
    # 2. CONSULTA SQL (Solo trae los que SÍ asistieron)
    query = """
    SELECT 
        p.titulo AS "Película",
        split_part(p.horario, ' ', 1) AS "Día",
        r.id AS "Ticket Validad",
        r.nombre_cliente AS "Cliente que Asistió",
        r.cantidad_personas AS "Espacios Reales Usados"
    FROM reservas r
    JOIN peliculas p ON r.pelicula_id = p.id
    WHERE r.asistio = TRUE
    ORDER BY p.titulo, r.id ASC;
    """
    
    df = pd.read_sql(query, engine)

    # Validamos si hay datos
    if df.empty:
        print("⚠️ No hay asistencias validadas para generar el reporte.")
    else:
        # 3. NOMBRE DEL ARCHIVO
        fecha_actual = datetime.now().strftime("%d-%m-%Y")
        nombre_excel = f"Asistencia_Final_{fecha_actual}.xlsx"

        # 4. GENERAR EXCEL Y AUTO-AJUSTAR CELDAS
        with pd.ExcelWriter(nombre_excel, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Asistencia Real')
            
            hoja = writer.sheets['Asistencia Real']
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

        print(f"✅ Reporte de ASISTENCIA generado con éxito: {nombre_excel}")

except Exception as e:
    print(f"❌ Error al generar el reporte de asistencia: {e}")