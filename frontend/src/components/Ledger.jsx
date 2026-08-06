import { formatWeight } from "../lib/format";

export function GradeRibbon({ weight }) {
  return (
    <span className="grade-ribbon">
      {weight != null ? formatWeight(weight) : "—"}
    </span>
  );
}

export function LedgerRow({ event, course }) {
  return (
    <article className="ledger-row">
      <GradeRibbon weight={event.grade_weight}/>
      <div className="ledger-main">
        <h3>{event.title}</h3>
        <p>
          <span className="swatch" style={{ background: course?.color }}/>
          {course?.code || "Course"} · {event.event_type}
        </p>
      </div>
      <div className="due-date"><span>Due</span>{event.due_date}</div>
      <span className={`status-pill ${event.status}`}>
        {event.status.replace("_", " ")}
      </span>
    </article>
  );
}

export function Empty({ text }) {
  return <p className="empty-state">{text}</p>;
}
