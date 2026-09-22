import React, { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Card,
  Checkbox,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { api, Permissions, PermissionsCatalog, RoleItem, StaffUser } from "../api";
import { useCan, useMe } from "../auth";
import { fmtDateTime } from "../datetime";
import { formatApiError } from "../format";
import { notifySuccess } from "../notify";
import { Button, MutedBadge } from "../ui";

type UserForm = { id?: number; username: string; email: string; password: string; role_id: string | null; is_active: boolean };
type RoleForm = { id?: number; name: string; description: string; permissions: Permissions; is_admin: boolean };

const EMPTY_USER: UserForm = { username: "", email: "", password: "", role_id: null, is_active: true };
const EMPTY_ROLE: RoleForm = { name: "", description: "", permissions: {}, is_admin: false };

export default function UsersPage() {
  const can = useCan();
  const me = useMe();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [catalog, setCatalog] = useState<PermissionsCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserForm | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; run: () => Promise<void> } | null>(null);

  const canEdit = can("users", "edit");
  const canDelete = can("users", "delete");

  async function reload() {
    setError(null);
    try {
      const [u, r, c] = await Promise.all([api.listUsers(), api.listRoles(), api.getPermissionsCatalog()]);
      setUsers(u);
      setRoles(r);
      setCatalog(c);
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function submit(fn: () => Promise<unknown>, message: string, close: () => void) {
    setFormError(null);
    setBusy(true);
    try {
      await fn();
      notifySuccess(message);
      close();
      await reload();
    } catch (e: unknown) {
      setFormError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  function saveUser() {
    if (!userForm) return;
    const payload = {
      username: userForm.username.trim(),
      email: userForm.email.trim(),
      role_id: Number(userForm.role_id || 0),
      is_active: userForm.is_active,
      ...(userForm.password ? { password: userForm.password } : {}),
    };
    void submit(
      () => (userForm.id ? api.updateUser(userForm.id, payload) : api.createUser({ ...payload, password: userForm.password })),
      userForm.id ? "Usuario actualizado." : "Usuario creado.",
      () => setUserForm(null),
    );
  }

  function saveRole() {
    if (!roleForm) return;
    const payload = roleForm.is_admin
      ? { name: roleForm.name.trim(), description: roleForm.description.trim() }
      : { name: roleForm.name.trim(), description: roleForm.description.trim(), permissions: roleForm.permissions };
    void submit(
      () => (roleForm.id ? api.updateRole(roleForm.id, payload) : api.createRole({ ...payload, permissions: roleForm.permissions })),
      roleForm.id ? "Rol actualizado." : "Rol creado.",
      () => setRoleForm(null),
    );
  }

  function togglePerm(module: string, action: string, checked: boolean) {
    setRoleForm((f) => {
      if (!f) return f;
      const current = new Set(f.permissions[module] ?? []);
      if (checked) {
        current.add(action);
        current.add("view");
      } else {
        current.delete(action);
        if (action === "view") {
          current.delete("edit");
          current.delete("delete");
        }
      }
      return { ...f, permissions: { ...f.permissions, [module]: Array.from(current) } };
    });
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.run();
      setConfirm(null);
      await reload();
    } catch (e: unknown) {
      setError(formatApiError(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const roleOptions = roles.map((r) => ({ value: String(r.id), label: r.name }));

  return (
    <Stack>
      {error ? <Alert color="red">{error}</Alert> : null}
      <Tabs defaultValue="users" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="users">Usuarios</Tabs.Tab>
          <Tabs.Tab value="roles">Roles y permisos</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users">
          <Card withBorder padding="md" radius="md">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Usuarios del panel</Text>
              {canEdit ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setFormError(null);
                    setUserForm({ ...EMPTY_USER, role_id: roleOptions.find((r) => r.label !== "Administrador")?.value ?? null });
                  }}
                >
                  <Group gap={6}><IconPlus size={16} />Nuevo usuario</Group>
                </Button>
              ) : null}
            </Group>
            <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="xs" horizontalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Usuario</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Rol</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Último ingreso</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td>
                      <Text fw={600} size="sm">{u.username}</Text>
                      {me?.id === u.id ? <Text size="xs" c="dimmed">vos</Text> : null}
                    </Table.Td>
                    <Table.Td>
                      {u.email ? <Text size="sm">{u.email}</Text> : <MutedBadge tone="yellow">Sin email</MutedBadge>}
                    </Table.Td>
                    <Table.Td>
                      <MutedBadge tone={u.is_admin ? "lilac" : "gray"}>{u.role?.name ?? "Sin rol"}</MutedBadge>
                    </Table.Td>
                    <Table.Td>
                      <MutedBadge tone={u.is_active ? "green" : "red"}>{u.is_active ? "Activo" : "Inactivo"}</MutedBadge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">{u.last_login_at ? fmtDateTime(u.last_login_at) : "Nunca"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        {canEdit ? (
                          <Tooltip label="Editar">
                            <ActionIcon
                              variant="subtle"
                              onClick={() => {
                                setFormError(null);
                                setUserForm({
                                  id: u.id,
                                  username: u.username,
                                  email: u.email ?? "",
                                  password: "",
                                  role_id: u.role ? String(u.role.id) : null,
                                  is_active: u.is_active,
                                });
                              }}
                            >
                              <IconPencil size={16} />
                            </ActionIcon>
                          </Tooltip>
                        ) : null}
                        {canDelete && me?.id !== u.id ? (
                          <Tooltip label="Eliminar">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() =>
                                setConfirm({
                                  title: "¿Eliminar usuario?",
                                  message: `Se elimina ${u.username}. Si tiene movimientos registrados conviene desactivarlo en su lugar.`,
                                  run: async () => {
                                    await api.deleteUser(u.id);
                                    notifySuccess("Usuario eliminado.");
                                  },
                                })
                              }
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        ) : null}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            </Table.ScrollContainer>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="roles">
          <Stack>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Cada usuario tiene un rol; el rol define qué puede ver, editar o eliminar en cada sección.</Text>
              {canEdit ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setFormError(null);
                    setRoleForm({ ...EMPTY_ROLE });
                  }}
                >
                  <Group gap={6}><IconPlus size={16} />Nuevo rol</Group>
                </Button>
              ) : null}
            </Group>
            {roles.map((r) => (
              <Card key={r.id} withBorder padding="md" radius="md">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Group gap={8}>
                      <Text fw={600}>{r.name}</Text>
                      {r.is_admin ? <MutedBadge tone="lilac">Acceso total</MutedBadge> : null}
                      <MutedBadge tone="gray">{r.users_count} usuario(s)</MutedBadge>
                    </Group>
                    {r.description ? <Text size="sm" c="dimmed">{r.description}</Text> : null}
                    {!r.is_admin ? (
                      <Text size="xs" c="dimmed">
                        {catalog?.modules
                          .filter((m) => (r.permissions[m.id] ?? []).length)
                          .map((m) => `${m.label} (${(r.permissions[m.id] ?? []).map((a) => actionShort(a)).join("/")})`)
                          .join(" · ") || "Sin permisos"}
                      </Text>
                    ) : null}
                  </Stack>
                  <Group gap={4} wrap="nowrap">
                    {canEdit ? (
                      <Tooltip label="Editar">
                        <ActionIcon
                          variant="subtle"
                          onClick={() => {
                            setFormError(null);
                            setRoleForm({
                              id: r.id,
                              name: r.name,
                              description: r.description ?? "",
                              permissions: { ...r.permissions },
                              is_admin: r.is_admin,
                            });
                          }}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                    ) : null}
                    {canDelete && !r.is_admin ? (
                      <Tooltip label="Eliminar">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() =>
                            setConfirm({
                              title: "¿Eliminar rol?",
                              message: `Se elimina el rol ${r.name}.`,
                              run: async () => {
                                await api.deleteRole(r.id);
                                notifySuccess("Rol eliminado.");
                              },
                            })
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    ) : null}
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={!!userForm}
        onClose={() => setUserForm(null)}
        title={userForm?.id ? "Editar usuario" : "Nuevo usuario"}
        radius="lg"
      >
        {userForm ? (
          <Stack>
            <TextInput
              label="Usuario"
              value={userForm.username}
              onChange={(e) => setUserForm({ ...userForm, username: e.currentTarget.value })}
              withAsterisk
            />
            <TextInput
              label="Email"
              description="Obligatorio: ahí le llega el código de verificación al ingresar."
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.currentTarget.value })}
              withAsterisk
            />
            <Select
              label="Rol"
              data={roleOptions}
              value={userForm.role_id}
              onChange={(v) => setUserForm({ ...userForm, role_id: v })}
              allowDeselect={false}
              withAsterisk
            />
            <PasswordInput
              label={userForm.id ? "Contraseña nueva (opcional)" : "Contraseña"}
              description="Mínimo 8 caracteres."
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.currentTarget.value })}
              withAsterisk={!userForm.id}
            />
            <Switch
              label="Usuario activo"
              checked={userForm.is_active}
              onChange={(e) => setUserForm({ ...userForm, is_active: e.currentTarget.checked })}
              disabled={me?.id === userForm.id}
            />
            {formError ? <Alert color="red">{formError}</Alert> : null}
            <Group justify="flex-end">
              <Button variant="ghost" onClick={() => setUserForm(null)}>Cancelar</Button>
              <Button variant="primary" onClick={saveUser} loading={busy}>Guardar</Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal
        opened={!!roleForm}
        onClose={() => setRoleForm(null)}
        title={roleForm?.id ? "Editar rol" : "Nuevo rol"}
        size="lg"
        radius="lg"
      >
        {roleForm ? (
          <Stack>
            <TextInput
              label="Nombre"
              value={roleForm.name}
              onChange={(e) => setRoleForm({ ...roleForm, name: e.currentTarget.value })}
              withAsterisk
            />
            <Textarea
              label="Descripción"
              autosize
              minRows={1}
              value={roleForm.description}
              onChange={(e) => setRoleForm({ ...roleForm, description: e.currentTarget.value })}
            />
            {roleForm.is_admin ? (
              <Alert color="violet" variant="light">
                El rol Administrador tiene acceso total y sus permisos no se pueden modificar.
              </Alert>
            ) : (
              <Table verticalSpacing={6} withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Sección</Table.Th>
                    {(catalog?.actions ?? []).map((a) => (
                      <Table.Th key={a.id} ta="center">{a.label}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(catalog?.modules ?? []).map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td><Text size="sm">{m.label}</Text></Table.Td>
                      {(catalog?.actions ?? []).map((a) => (
                        <Table.Td key={a.id} ta="center">
                          {m.actions.includes(a.id) ? (
                            <Checkbox
                              style={{ display: "inline-block" }}
                              aria-label={`${m.label}: ${a.label}`}
                              checked={(roleForm.permissions[m.id] ?? []).includes(a.id)}
                              onChange={(e) => togglePerm(m.id, a.id, e.currentTarget.checked)}
                            />
                          ) : (
                            <Text size="xs" c="dimmed">—</Text>
                          )}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            {formError ? <Alert color="red">{formError}</Alert> : null}
            <Group justify="flex-end">
              <Button variant="ghost" onClick={() => setRoleForm(null)}>Cancelar</Button>
              <Button variant="primary" onClick={saveRole} loading={busy}>Guardar</Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal opened={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title} radius="lg">
        <Stack>
          <Text size="sm">{confirm?.message}</Text>
          <Group justify="flex-end">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void runConfirm()} loading={busy}>Eliminar</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function actionShort(action: string): string {
  if (action === "view") return "ver";
  if (action === "edit") return "editar";
  if (action === "delete") return "eliminar";
  return action;
}
