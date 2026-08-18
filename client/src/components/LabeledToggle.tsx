interface LabeledToggleProps {
  id: string;
  label: string;
  leftLabel: string;
  rightLabel: string;
  /** false = leftLabel aktivan, true = rightLabel aktivan */
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Toggle switch (daisyUI "toggle") sa nazivima obje opcije ispisanim sa
 * strane, tako da je uvijek jasno šta je trenutno aktivno - koristi se i za
 * izbor baze (RavenDB/OrientDB) i za izbor režima (optimizovano/neoptimizovano).
 */
export function LabeledToggle({
  id,
  label,
  leftLabel,
  rightLabel,
  checked,
  onChange,
  disabled,
}: LabeledToggleProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-medium transition-opacity ${!checked ? "opacity-100" : "opacity-40"}`}>
          {leftLabel}
        </span>
        <input
          id={id}
          type="checkbox"
          className="toggle toggle-primary"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className={`text-sm font-medium transition-opacity ${checked ? "opacity-100" : "opacity-40"}`}>
          {rightLabel}
        </span>
      </div>
    </div>
  );
}
