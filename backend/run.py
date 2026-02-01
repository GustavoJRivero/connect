from app import create_app

app = create_app()

if __name__ == "__main__":
    # Evita reloader multi-proceso (y locks de SQLite) en Windows
    app.run(host="0.0.0.0", port=5001, debug=True, use_reloader=False)

