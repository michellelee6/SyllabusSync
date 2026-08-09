import { useState } from "react";
import { BookOpen, CalendarDays, Calculator, ClipboardList, LayoutDashboard, Trash2, Upload, X } from "lucide-react";

const navigation = [
  ["overview", LayoutDashboard, "Dashboard"],
  ["board", ClipboardList, "Task Board"],
  ["calendar", CalendarDays, "Calendar"],
  ["grades", Calculator, "Grade Calculator"],
];

export function Sidebar({ courses, courseMap, currentView, setView, upload, deleteCourse, apiUrl }) {
  const [courseToDelete, setCourseToDelete] = useState(null);
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">S</div><div><div className="brand-name">SyllabusSync</div><div className="brand-sub">{courses[0]?.term || "Academic ledger"}</div></div></div>
    <nav>{navigation.map(([id, Icon, label]) => <button key={id} onClick={() => setView(id)} className={`nav-item ${currentView === id ? "active" : ""}`}><Icon size={16}/>{label}</button>)}</nav>
    <div className="course-roster"><div className="nav-label">Courses</div>{courses.length ? courses.map(course => <div className="course-row" key={course.id}><span className="swatch" style={{ background: courseMap[course.id]?.color }}/><span>{course.code} — {course.title}</span><button className="delete-course" aria-label={`Delete ${course.code}`} title={`Delete ${course.code}`} onClick={() => setCourseToDelete(course)}><Trash2 size={14}/></button></div>) : <div className="course-row muted-course"><BookOpen size={14}/>No courses yet</div>}</div>
    <div className="sidebar-foot"><label className="upload-zone"><Upload size={15}/><strong>Upload syllabus</strong><span>drop PDF or click to browse</span><input type="file" accept="application/pdf" onChange={event => upload(event.target.files?.[0])}/></label><a href={`${apiUrl}/events/export.ics`} className="export-link">Export calendar (.ics)</a></div>
    {courseToDelete && <div className="modal-backdrop"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-course-heading"><button className="dialog-close" aria-label="Close" onClick={() => setCourseToDelete(null)}><X size={19}/></button><p className="eyebrow">Delete course</p><h2 id="delete-course-heading">Delete {courseToDelete.code}?</h2><p>This will permanently delete the course and all of its tasks.</p><div className="form-actions"><button type="button" onClick={() => setCourseToDelete(null)}>Cancel</button><button className="danger-button" type="button" onClick={() => { deleteCourse(courseToDelete); setCourseToDelete(null); }}>Delete course</button></div></section></div>}
  </aside>;
}
