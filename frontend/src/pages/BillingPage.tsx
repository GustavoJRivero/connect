import React, { useState } from "react";
import { api } from "../api";
import { Button, Card, Field } from "../ui";

export default function BillingPage() {
  const [issueDate, setIssueDate] = useState("");
  const [issue, setIssue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    try {
      const payload: any = { issue };
      if (issueDate) payload.issue_date = issueDate;
      const res = await api.generateBilling(payload);
      // no-op: quitamos debug json
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  async function enforce() {
    setError(null);
    try {
      const res = await api.enforceBilling({});
      // no-op: quitamos debug json
    } catch (e: any) {
      setError(`${e?.status ?? ""} ${JSON.stringify(e?.body ?? e)}`);
    }
  }

  return (
    <div className="row">
      <div className="col-lg-6">
        <Card className="card card-outline card-primary" title="Generación de facturas (por conexión)">
          <Field
            label="Fecha de emisión (opcional YYYY-MM-DD)"
            value={issueDate}
            onChange={setIssueDate}
            placeholder="2026-01-31"
          />
          <div className="form-check mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              checked={issue}
              onChange={(e) => setIssue(e.target.checked)}
              id="issueDirect"
            />
            <label className="form-check-label" htmlFor="issueDirect">
              Emitir directamente (ISSUED)
            </label>
          </div>
          <Button variant="primary" onClick={generate}>
            <i className="fa-solid fa-rotate me-2" />
            Generar
          </Button>
        </Card>
      </div>

      <div className="col-lg-6">
        <Card className="card card-outline card-danger" title="Corte / reconexión automático">
          <p className="text-muted mb-3">Evalúa facturas vencidas impagas y aplica CUT/RESTORE en Mikrotik.</p>
          <Button variant="danger" onClick={enforce}>
            <i className="fa-solid fa-bolt me-2" />
            Ejecutar enforce
          </Button>
        </Card>
      </div>

      {error ? (
        <div className="col-12">
          <div className="alert alert-danger sc-error">{error}</div>
        </div>
      ) : null}

    </div>
  );
}

