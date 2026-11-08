// ImageField.tsx
// Pick, preview and remove one picture in Manage: it uploads straight away (shrunk in the
// browser) and reports the address to the parent, which saves it with the rest of the form.

import { useRef, useState } from "react";
import { deleteSiteImage, uploadSiteImage } from "../../../lib/siteImages";

interface Props {
  label: string;
  /** shown in the picture's file name, e.g. "service" or "hair" */
  kind: string;
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  testId?: string;
}

const ImageField = ({ label, kind, value, onChange, testId }: Props) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      onChange(await uploadSiteImage(file, kind));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The picture could not be uploaded.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div data-testid={testId}>
      <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        {value && (
          <img
            src={value}
            alt=""
            style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--admin-border, var(--border))" }}
          />
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          data-testid={testId ? `${testId}-file` : undefined}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} style={{ padding: "0.4rem 0.8rem" }}>
          {busy ? "Uploading..." : value ? "Replace picture" : "Choose picture"}
        </button>
        {value && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void deleteSiteImage(value);
              onChange(undefined);
            }}
            style={{ padding: "0.4rem 0.8rem" }}
          >
            Remove
          </button>
        )}
      </div>
      {problem && (
        <p role="alert" style={{ color: "var(--error)", fontSize: "0.78rem", margin: "0.25rem 0 0" }}>
          {problem}
        </p>
      )}
    </div>
  );
};

export default ImageField;
