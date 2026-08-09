import { useEffect, useState } from "react";
import { DndContext, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { formatWeight } from "../lib/format";
import { GradeRibbon } from "./Ledger";

const columns = [["todo", "To Do"], ["in_progress", "In Progress"], ["done", "Done"]];
const columnId = status => `column-${status}`;
const taskId = event => `event-${event.id}`;

function groupedEvents(events) {
  return Object.fromEntries(columns.map(([status]) => [status, events.filter(event => event.status === status)]));
}

export function TaskBoard({ events, courses, courseMap, setStatus, createTask }) {
  const [items, setItems] = useState(() => groupedEvents(events));
  const [activeEvent, setActiveEvent] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const doneWeight = events.filter(event => event.status === "done" && event.grade_weight != null).reduce((sum, event) => sum + event.grade_weight, 0);

  useEffect(() => setItems(groupedEvents(events)), [events]);

  function findContainer(id, source = items) {
    if (id?.startsWith("column-")) return id.replace("column-", "");
    return Object.keys(source).find(status => source[status].some(event => taskId(event) === id));
  }

  function handleDragStart({ active }) {
    const source = findContainer(active.id);
    setActiveEvent(items[source]?.find(event => taskId(event) === active.id) || null);
  }

  function handleDragOver({ active, over }) {
    if (!over) return;
    setItems(current => {
      const source = findContainer(active.id, current);
      const destination = findContainer(over.id, current);
      if (!source || !destination || source === destination) return current;
      const activeIndex = current[source].findIndex(event => taskId(event) === active.id);
      const moving = current[source][activeIndex];
      const targetItems = current[destination];
      const overIndex = targetItems.findIndex(event => taskId(event) === over.id);
      const next = { ...current, [source]: current[source].filter(event => taskId(event) !== active.id) };
      next[destination] = [...targetItems];
      next[destination].splice(overIndex < 0 ? targetItems.length : overIndex, 0, moving);
      return next;
    });
  }

  async function handleDragEnd({ active, over }) {
    const moved = activeEvent;
    setActiveEvent(null);
    if (!over || !moved) return;
    const destination = findContainer(over.id);
    if (destination && destination !== moved.status) await setStatus(moved, destination);
  }

  function handleDragCancel() {
    setActiveEvent(null);
    setItems(groupedEvents(events));
  }

  return <>
    <div className="board-actions"><button className="add-task-button" onClick={() => setFormOpen(true)}><Plus size={16}/>Add task</button></div>
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="board">{columns.map(([status, label]) => <BoardColumn key={status} status={status} label={label} events={items[status] || []} courseMap={courseMap} doneWeight={doneWeight}/>)}</div>
    </DndContext>
    {formOpen && <TaskForm courses={courses} close={() => setFormOpen(false)} createTask={createTask}/>} 
  </>;
}

function BoardColumn({ status, label, events, courseMap, doneWeight }) {
  const { setNodeRef } = useDroppable({ id: columnId(status) });
  return <section className="board-column" id={columnId(status)}>
    <div className="column-head"><h2>{label}</h2><span>{events.length}</span></div>
    <SortableContext items={events.map(taskId)} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className="board-drop-zone">{events.length ? events.map(event => <TaskCard key={event.id} event={event} course={courseMap[event.course_id]}/>) : <EmptyColumn status={status} doneWeight={doneWeight}/>}</div>
    </SortableContext>
  </section>;
}

function TaskCard({ event, course }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: taskId(event) });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };
  return <article ref={setNodeRef} style={style} className="task-card" {...attributes} {...listeners}><div className="card-top"><p className="course-chip"><i style={{ background: course?.color }}/>{course?.code || "Course"}</p><GradeRibbon weight={event.grade_weight}/></div><h3>{event.title}</h3><p className="card-due">Due {event.due_date}</p><p className="drag-hint">Drag to move task</p></article>;
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
