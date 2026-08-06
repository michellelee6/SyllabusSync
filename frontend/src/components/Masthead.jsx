import { MessageCircle } from "lucide-react";

const titles = {
  board: "Task Board",
  calendar: "Calendar",
  grades: "Grade Calculator",
  overview: "Keep your semester in sync.",
};

export function Masthead({ view, courses, events, notice, completedWeight, openChat }) {
  const subline = notice || (
    courses.length
      ? `${events.length} dates parsed across ${courses.length} course${courses.length === 1 ? "" : "s"}`
      : "Upload a syllabus to turn deadlines into an organized plan."
  );

  return (
    <header className="masthead">
      <div>
        <h1>{titles[view]}</h1>
        <p className="subline">{subline}</p>
      </div>
      <div className="masthead-actions">
        <button onClick={openChat} className="ask-button"><MessageCircle size={16}/>Ask Syllabus</button>
      </div>
    </header>
  );
}
