from app import create_app

app = create_app()

if __name__ == "__main__":
    # use_reloader=False evita doble proceso en Windows
    app.run(host="0.0.0.0", port=5001, debug=True, use_reloader=False)

