type Props = { label: string; fraction?: number };

export function ProgressBar({ label, fraction }: Props) {
  const indeterminate = fraction === undefined;
  return (
    <div className="w-full">
      <p className="text-sm text-gray-600 mb-2">{label}</p>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        {indeterminate ? (
          <div className="h-2 bg-blue-500 animate-pulse" style={{ width: "33%" }} />
        ) : (
          <div
            className="h-2 bg-blue-500 transition-all"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}
