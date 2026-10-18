export interface Step {
  label: string;
  time: string;
  state: 'done' | 'current' | 'todo' | 'danger';
}

/** Horizontal progress track: dots joined by a line, label and time under each dot. */
export function ProgressTrack({ steps, className = '' }: { steps: Step[]; className?: string }) {
  return (
    <ol className={`progress ${className}`}>
      {steps.map((s, i) => {
        const nextDone = i < steps.length - 1 && s.state === 'done' && (steps[i + 1].state === 'done' || steps[i + 1].state === 'current');
        return (
          <li key={s.label} className={`pstep pstep-${s.state}`}>
            <span className="ptrack">
              <span className="pdot" />
              {i < steps.length - 1 && <span className={`pline ${nextDone ? 'done' : ''}`} />}
            </span>
            <span className="plabel">{s.label}</span>
            <span className="ptime">{s.time || ' '}</span>
          </li>
        );
      })}
    </ol>
  );
}
