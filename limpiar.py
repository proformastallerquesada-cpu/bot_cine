import psycopg2

try:
    conn = psycopg2.connect("dbname=bot_cine user=postgres password=12345 host=localhost")
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE reservas;")
    conn.commit()
    print("✅ Tabla de reservas limpia. ¡Listo para pruebas nuevas!")
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")