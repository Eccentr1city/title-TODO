// Summary of what an import or refactor did.
export function ResultCard({ title, lines, errors }: { title: string; lines: string[]; errors: string[] }) {
  return (
    <div className="incandescent-card p-4 space-y-3">
      <h3 className="heat-3">{title}</h3>
      {lines.length > 0 && (
        <ul className="space-y-1 text-sm max-h-80 overflow-y-auto">
          {lines.map((line, i) => (
            <li key={i}>
              <span className="text-accent">+</span> {line}
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul className="space-y-1 text-sm text-error">
          {errors.map((e, i) => (
            <li key={i}>! {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
