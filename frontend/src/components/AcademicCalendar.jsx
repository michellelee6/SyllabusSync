import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { formatWeight } from "../lib/format";

export function AcademicCalendar({ events, courseMap }) {
  const calendarEvents = events.map(event => ({
    id: String(event.id),
    title: `${event.title}${event.grade_weight != null ? ` · ${formatWeight(event.grade_weight)}` : ""}`,
    date: event.due_date,
    backgroundColor: "#f5e8e6",
    borderColor: courseMap[event.course_id]?.color || "#7A2E2E",
    textColor: "#7A2E2E",
  }));

  return (
    <>
      <div className="calendar-legend">
        {Object.values(courseMap).map(course => (
          <span key={course.id}>
            <i style={{ background: course.color }}/>
            {course.code}
          </span>
        ))}
      </div>
      <div className="calendar-frame">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="auto"
          headerToolbar={{ left: "title", center: "", right: "today prev,next" }}
          events={calendarEvents}
        />
      </div>
    </>
  );
}
