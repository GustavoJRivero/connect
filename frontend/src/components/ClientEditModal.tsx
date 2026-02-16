import React, { useEffect, useState } from "react";
import { Modal, Select, Grid, Checkbox, Alert, Group } from "@mantine/core";
import { api } from "../api";
import { Button, Field } from "../ui";

export function ClientEditModal(props: {
  open: boolean;
  clientId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<unknown>(null);
  const [kind, setKind] = useState<"PERSON" | "COMPANY">("PERSON");
  const [fullName, setFullName] = useState("");
  const [dni, setDni] = useState("");
  const [cuit, setCuit] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setClient(null);
    if (!props.clientId) return;
    setLoading(true);
    api
      .getClient(Number(props.clientId))
      .then((c: unknown) => {
        const x = c as { kind?: string; full_name?: string; dni?: string; cuit?: string; phone?: string; email?: string; address?: string; is_active?: boolean };
        setClient(c);
        setKind((x?.kind ?? "PERSON").toUpperCase() === "COMPANY" ? "COMPANY" : "PERSON");
        setFullName(String(x?.full_name ?? ""));
        setDni(String(x?.dni ?? ""));
        setCuit(String(x?.cuit ?? ""));
        setPhone(String(x?.phone ?? ""));
        setEmail(String(x?.email ?? ""));
        setAddress(String(x?.address ?? ""));
        setIsActive(Boolean(x?.is_active ?? true));
      })
      .catch((e: unknown) => {
        const err = e as { status?: number; body?: unknown };
        setError(`${err?.status ?? ""} ${JSON.stringify(err?.body ?? e)}`);
      })
      .finally(() => setLoading(false));
  }, [props.open, props.clientId]);

  async function save() {
    setError(null);
    if (!props.clientId) return;
    if (!fullName.trim()) {
      setError("Nombre / Razón social es requerido.");
      return;
    }
    try {
      await api.updateClient(Number(props.clientId), {
        kind,
        full_name: fullName.trim(),
        dni: kind === "PERSON" ? (dni.trim() || null) : null,
        cuit: kind === "COMPANY" ? (cuit.trim() || null) : null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        is_active: Boolean(isActive),
      });
      props.onSaved();
    } catch (e: unknown) {
      const body = (e as { status?: number; body?: { error?: string; client_id?: number } })?.body ?? e;
      const err = e as { status?: number; body?: { error?: string; client_id?: number } };
      if (err?.status === 409 && (body as { error?: string })?.error === "dni_already_exists") {
        setError(`DNI ya existe (cliente #${(body as { client_id?: number })?.client_id}).`);
        return;
      }
      if (err?.status === 409 && (body as { error?: string })?.error === "cuit_already_exists") {
        setError(`CUIT ya existe (cliente #${(body as { client_id?: number })?.client_id}).`);
        return;
      }
      setError(`${err?.status ?? ""} ${JSON.stringify(body)}`);
    }
  }

  return (
    <Modal
      opened={props.open}
      onClose={props.onClose}
      title={`Editar cliente ${props.clientId ? `#${props.clientId}` : ""}`}
      size="lg"
    >
      {error ? <Alert color="red" className="sc-error" mb="md">{error}</Alert> : null}
      {loading ? <div>Cargando...</div> : null}

      {!loading && client ? (
        <>
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Select
                label="Tipo"
                value={kind}
                onChange={(v) => { const k = (v ?? "PERSON") as "PERSON" | "COMPANY"; setKind(k); if (k === "PERSON") setCuit(""); else setDni(""); }}
                data={[{ value: "PERSON", label: "Persona" }, { value: "COMPANY", label: "Empresa" }]}
              />
              <Field label="Nombre / Razón social" value={fullName} onChange={setFullName} />
              {kind === "PERSON" ? <Field label="DNI" value={dni} onChange={setDni} /> : <Field label="CUIT" value={cuit} onChange={setCuit} />}
              <Grid>
                <Grid.Col span={6}><Field label="Tel/Cel" value={phone} onChange={setPhone} /></Grid.Col>
                <Grid.Col span={6}><Field label="Email" value={email} onChange={setEmail} /></Grid.Col>
              </Grid>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Field label="Dirección" value={address} onChange={setAddress} />
              <Checkbox label="Activo" checked={isActive} onChange={(e) => setIsActive(e.currentTarget.checked)} mt="sm" />
              <p style={{ fontSize: "var(--mantine-font-size-sm)", color: "var(--mantine-color-dimmed)", marginTop: 12 }}>
                Solo se editan datos del titular. Las conexiones se gestionan en la solapa "Conexiones".
              </p>
            </Grid.Col>
          </Grid>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={props.onClose}>Cancelar</Button>
            <Button variant="primary" onClick={save}>Guardar</Button>
          </Group>
        </>
      ) : null}
    </Modal>
  );
}
