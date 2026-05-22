# Un solo proceso (--workers 1): en este proceso corre el hilo del worker de jobs.
# Así la API y la cola comparten proceso y BD, sin contenedor aparte ni problemas de visibilidad.
def post_worker_init(worker):
    try:
        from wsgi import app
        with app.app_context():
            from app.extensions import db
            if getattr(db, "engine", None) is not None:
                db.engine.dispose()
        from app.tasks.worker import start_worker
        from app.tasks.billing_scheduler import start_billing_scheduler

        start_worker(app)
        worker.log.info("Worker de jobs (hilo) iniciado en este proceso")

        start_billing_scheduler(app)
        worker.log.info("Scheduler de facturación (hilo) iniciado en este proceso")
    except Exception as e:
        import traceback
        worker.log.error("No se pudo iniciar el worker de jobs: %s\n%s", e, traceback.format_exc())
