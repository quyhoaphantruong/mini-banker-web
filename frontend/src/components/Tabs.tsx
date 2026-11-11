import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  testId: string;
}

interface Props<Id extends string> {
  label: string;
  items: readonly TabItem<Id>[];
  selected: Id;
  onSelect: (id: Id) => void;
  idPrefix: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}

export function Tabs<Id extends string>({
  label,
  items,
  selected,
  onSelect,
  idPrefix,
  children,
  variant = "primary",
}: Props<Id>) {
  const refs = useRef(new Map<Id, HTMLButtonElement>());

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = items[(index + step + items.length) % items.length];
    if (next) {
      onSelect(next.id);
      refs.current.get(next.id)?.focus();
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className={`tablist tablist-${variant}`}
      >
        {items.map((item, i) => (
          <button
            key={item.id}
            ref={(el) => {
              if (el) refs.current.set(item.id, el);
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={item.id === selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={item.id === selected ? 0 : -1}
            data-testid={item.testId}
            className="tab"
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${idPrefix}-panel`}
        aria-labelledby={`${idPrefix}-tab-${selected}`}
        className="tabpanel"
      >
        {children}
      </div>
    </div>
  );
}
