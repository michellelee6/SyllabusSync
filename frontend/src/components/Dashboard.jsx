import { formatWeight } from "../lib/format";
import { Empty, LedgerRow } from "./Ledger";

export function Dashboard({ courses, events, courseMap, completedWeight, totalWeight, setView, openChat }) {
  const upcoming = events.filter(event => event.status !== "done").slice(0, 5);
  const completed = events.filter(event => event.status === "done").length;
  const remainingWeight = Math.max(totalWeight - completedWeight, 0);
  return <>
    <div className="stat-strip"><Stat label="Courses tracked" value={courses.length}/><Stat label={`Upcoming${remainingWeight ? `, worth ${formatWeight(remainingWeight)}` : " work"}`} value={upcoming.length} accent/><Stat label="Completed" value={completed} moss/></div>
    <section><div className="section-head"><h2>Next up</h2><button onClick={() => setView("board")} className="view-link">View board →</button></div><div className="ledger">{upcoming.length ? upcoming.map(event => <LedgerRow event={event} course={courseMap[event.course_id]} key={event.id}/>) : <Empty text="No deadlines yet — upload a syllabus PDF to begin your ledger."/>}</div></section>
    <div className="overview-grid"><section className="panel"><h2>Grade weight</h2><div className="weight-bar"><span className="weight-complete" style={{ width: `${Math.min(completedWeight, 100)}%` }}/><span className="weight-remaining" style={{ width: `${Math.min(remainingWeight, Math.max(100 - completedWeight, 0))}%` }}/></div><div className="weight-legend"><span className="complete">{formatWeight(completedWeight)} completed</span><span className="remaining">{formatWeight(remainingWeight)} remaining</span></div></section><section className="ask-panel"><h2>Ask the syllabus</h2><p>Get concise answers grounded in the course document you uploaded.</p><button onClick={openChat} className="quick-prompt">What is the grading breakdown?</button><button onClick={openChat} className="quick-prompt">What should I prepare for next?</button><button onClick={openChat} className="ask-panel-button">Open Syllabus Q&A</button></section></div>
  </>;
}

function Stat({ label, value, accent, moss }) { return <div className="stat"><strong className={accent ? "accent" : moss ? "moss" : ""}>{value}</strong><span>{label}</span></div>; }
