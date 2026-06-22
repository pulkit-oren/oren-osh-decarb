"use client";

export function ScopeScreen({ scope, onBack }: { scope: 1 | 2; onBack: () => void }) {
  return <button onClick={onBack}>Back</button>;
}
