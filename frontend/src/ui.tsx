import React from "react";

export function Card(props: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className={props.className ?? "card"}>
      {props.title ? (
        <div className="card-header d-flex align-items-center justify-content-between">
          <h3 className="card-title mb-0">{props.title}</h3>
          {props.headerRight ? <div className="card-tools">{props.headerRight}</div> : null}
        </div>
      ) : null}
      <div className={props.bodyClassName ?? "card-body"}>{props.children}</div>
      {props.footer ? <div className="card-footer">{props.footer}</div> : null}
    </div>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="mb-3">
      <label className="form-label">{props.label}</label>
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="form-control"
      />
    </div>
  );
}

export function Button(props: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "danger" | "default" | "secondary" | "ghost" | "info" | "warning";
  disabled?: boolean;
}) {
  const klass =
    props.variant === "primary"
      ? "btn btn-sm btn-primary"
      : props.variant === "danger"
        ? "btn btn-sm btn-danger"
        : props.variant === "info"
          ? "btn btn-sm btn-info"
          : props.variant === "warning"
            ? "btn btn-sm btn-warning"
            : props.variant === "ghost"
              ? "btn btn-sm btn-link"
              : "btn btn-sm btn-secondary";

  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={props.onClick}
      className={klass}
    >
      {props.children}
    </button>
  );
}

export function CodeBlock({ data }: { data: any }) {
  return (
    <pre className="p-3 mb-0 bg-light" style={{ borderRadius: 6, overflow: "auto" }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

