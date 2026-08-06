import { useMemo, useState } from "react";
import { formatWeight } from "../lib/format";
import { Empty } from "./Ledger";

export function GradeCalculator({ events, completedWeight, totalWeight }) {
  const weighted = events.filter(event => event.grade_weight != null && event.grade_weight > 0);
  const [scores, setScores] = useState({});
  const entered = weighted.filter(event => scores[event.id] !== "" && scores[event.id] != null);
  const enteredWeight = entered.reduce((sum, event) => sum + event.grade_weight, 0);
  const grade = useMemo(() => {
    if (!enteredWeight) return null;
    return entered.reduce((sum, event) => sum + (Number(scores[event.id]) * event.grade_weight), 0) / enteredWeight;
  }, [entered, enteredWeight, scores]);

  function updateScore(eventId, value) {
    if (value === "") {
      setScores(current => ({ ...current, [eventId]: "" }));
      return;
    }
    const score = Math.min(100, Math.max(0, Number(value)));
    setScores(current => ({ ...current, [eventId]: score }));
  }

  return (
    <>
      <section className="grade-calculator-intro">
        <div>
          <p className="calculator-label">Projected course grade</p>
          <strong>{grade == null ? "—" : `${grade.toFixed(1)}%`}</strong>
          <p>Based on {formatWeight(enteredWeight)} of entered weighted work.</p>
        </div>
        <div className="grade-summary compact">
          <div><span>Scheduled weight</span><strong>{formatWeight(totalWeight)}</strong></div>
          <div><span>Completed tasks</span><strong>{formatWeight(completedWeight)}</strong></div>
        </div>
      </section>
      <section>
        <div className="section-head">
          <div><h2>Enter theoretical scores</h2><p className="section-description">Try different scores to see their weighted effect on your course grade.</p></div>
          <span className="section-note">From extracted syllabus data</span>
        </div>
        <div className="score-table">
          {weighted.length ? <>
            <div className="score-table-head"><span>Assessment</span><span>Weight</span><span>Theoretical score</span><span>Weighted points</span></div>
            {weighted.map(event => {
              const score = scores[event.id];
              const hasScore = score !== "" && score != null;
              return <div className="score-row" key={event.id}><div><strong>{event.title}</strong><span>{event.event_type} · due {event.due_date}</span></div><b>{formatWeight(event.grade_weight)}</b><label><input type="number" inputMode="decimal" min="0" max="100" value={score ?? ""} onChange={input => updateScore(event.id, input.target.value)} placeholder="e.g. 92"/><em>%</em></label><b>{hasScore ? formatWeight((Number(score) * event.grade_weight) / 100) : "—"}</b></div>;
            })}
          </> : <Empty text="No grade weights were found in your uploaded syllabi."/>}
        </div>
      </section>
    </>
  );
}
