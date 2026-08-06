import { useState } from "react";
import { Plus } from "lucide-react";
import { formatWeight } from "../lib/format";
import { GradeRibbon } from "./Ledger";

const columns = [["todo", "To Do"], ["in_progress", "In Progress"], ["done", "Done"]];

export function TaskBoard({ events, courses, courseMap, setStatus, createTask }) {
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const doneWeight = events.filter(event => event.status === "done" && event.grade_weight != null).reduce((sum, event) => sum + event.grade_weight, 0);

  async function dropOnColumn(status) {
    if (draggedEvent && draggedEvent.status !== status) await setStatus(draggedEvent, status);
    setDraggedEvent(null);
  }

  return <>
    <div className="board-actions"><button className="add-task-button" onClick={() => setFormOpen(true)}><Plus size={16}/>Add task</button></div>
    <div className="board">{columns.map(([status, label]) => { const items = events.filter(event => event.status === status); return <section className="board-column" key={status} onDragOver={event => event.preventDefault()} onDrop={() => dropOnColumn(status)}><div className="column-head"><h2>{label}</h2><span>{items.length}</span></div>{items.length ? items.map(event => <TaskCard key={event.id} event={event} course={courseMap[event.course_id]} setDraggedEvent={setDraggedEvent}/>) : <EmptyColumn status={status} doneWeight={doneWeight}/>}</section>; })}</div>
    {formOpen && <TaskForm courses={courses} close={() => setFormOpen(false)} createTask={createTask}/>} 
  </>;
}

function TaskCard({ event, course, setDraggedEvent }) {
  return <article className="task-card" draggable onDragStart={() => setDraggedEvent(event)} onDragEnd={() => setDraggedEvent(null)}><div className="card-top"><p className="course-chip"><i style={{ background: course?.color }}/>{course?.code || "Course"}</p><GradeRibbon weight={event.grade_weight}/></div><h3>{event.title}</h3><p className="card-due">Due {event.due_date}</p><p className="drag-hint">Drag to change status</p></article>;
}

function EmptyColumn({ status, doneWeight }) {
  const copy = status === "done" ? ["Nothing finished yet", `${formatWeight(Math.max(100 - doneWeight, 0))} of your grade is still ahead of you`] : status === "in_progress" ? ["Nothing in motion", "Drag a task here once you start it"] : ["No tasks to do", "Your calendar is clear for now"];
  return <div className="empty-column"><strong>{copy[0]}</strong><span>{copy[1]}</span></div>;
}

function TaskForm({ courses, close, createTask }) {
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(String(courses[0]?.id || ""));
  const [dueDate, setDueDate] = useState("");
  const [eventType, setEventType] = useState("assignment");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!courseId) return setError("Upload a syllabus first so the task has a course.");
    try { await createTask({ course_id: Number(courseId), title, due_date: dueDate, event_type: eventType, grade_weight: weight === "" ? null : Number(weight) }); close(); }
    catch (submissionError) { setError(submissionError.message); }
  }

  return <div className="modal-backdrop" role="presentation"><form className="task-form" onSubmit={submit}><div className="form-heading"><div><p className="eyebrow">Personal planning</p><h2>Add a task</h2></div><button type="button" onClick={close}>×</button></div><label>Task name<input required value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Review lecture notes"/></label><label>Course<select value={courseId} onChange={event => setCourseId(event.target.value)}>{courses.map(course => <option key={course.id} value={course.id}>{course.code} — {course.title}</option>)}</select></label><div className="form-grid"><label>Due date<input required type="date" value={dueDate} onChange={event => setDueDate(event.target.value)}/></label><label>Type<select value={eventType} onChange={event => setEventType(event.target.value)}><option value="assignment">Assignment</option><option value="exam">Exam</option><option value="quiz">Quiz</option><option value="reading">Reading</option><option value="other">Other</option></select></label></div><label>Grade weight <small>(optional)</small><input type="number" min="0" max="100" step="0.1" value={weight} onChange={event => setWeight(event.target.value)} placeholder="e.g. 10"/></label>{error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Add task</button></div></form></div>;
}
