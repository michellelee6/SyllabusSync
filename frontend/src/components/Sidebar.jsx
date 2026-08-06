import { BookOpen, CalendarDays, Calculator, ClipboardList, LayoutDashboard, Upload } from "lucide-react";

const navigation = [
  ["overview", LayoutDashboard, "Dashboard"],
  ["board", ClipboardList, "Task Board"],
  ["calendar", CalendarDays, "Calendar"],
  ["grades", Calculator, "Grade Calculator"],
];

export function Sidebar({ courses, courseMap, currentView, setView, upload, apiUrl }) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">S</div><div><div className="brand-name">SyllabusSync</div><div className="brand-sub">{courses[0]?.term || "Academic ledger"}</div></div></div>
    <nav><div className="nav-label">Command center</div>{navigation.map(([id, Icon, label]) => <button key={id} onClick={() => setView(id)} className={`nav-item ${currentView === id ? "active" : ""}`}><Icon size={16}/>{label}</button>)}</nav>
    <div className="course-roster"><div className="nav-label">Courses</div>{courses.length ? courses.map(course => <div className="course-row" key={course.id}><span className="swatch" style={{ background: courseMap[course.id]?.color }}/><span>{course.code} — {course.title}</span></div>) : <div className="course-row muted-course"><BookOpen size={14}/>No courses yet</div>}</div>
    <div className="sidebar-foot"><label className="upload-zone"><Upload size={15}/><strong>Upload syllabus</strong><span>drop PDF or click to browse</span><input type="file" accept="application/pdf" onChange={event => upload(event.target.files?.[0])}/></label><a href={`${apiUrl}/events/export.ics`} className="export-link">Export calendar (.ics)</a></div>
  </aside>;
}
