import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { request, API } from "./lib/api";
import { courseColors } from "./lib/format";
import { Sidebar } from "./components/Sidebar";
import { Masthead } from "./components/Masthead";
import { Dashboard } from "./components/Dashboard";
import { TaskBoard } from "./components/TaskBoard";
import { AcademicCalendar } from "./components/AcademicCalendar";
import { GradeCalculator } from "./components/GradeCalculator";
import { ChatDrawer } from "./components/ChatDrawer";
import "./styles.css";

function App() {
  const [view, setView] = useState("overview");
  const [courses, setCourses] = useState([]);
  const [events, setEvents] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    try {
      const [courseList, eventList] = await Promise.all([request("/courses"), request("/events")]);
      setCourses(courseList);
      setEvents(eventList);
      setSelectedCourse(current => current || String(courseList[0]?.id || ""));
    } catch {
      setNotice("Start the FastAPI server to load your courses.");
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const courseMap = useMemo(
    () => Object.fromEntries(
      courses.map((course, index) => [
        course.id,
        {
          ...course,
          color: course.color || courseColors[index % courseColors.length],
        },
      ]),
    ),
    [courses],
  );
  const weightedEvents = events.filter(
    event => event.grade_weight != null,
  );
  const totalWeight = weightedEvents.reduce(
    (sum, event) => sum + event.grade_weight,
    0,
  );
  const completedWeight = weightedEvents
    .filter(event => event.status === "done")
    .reduce((sum, event) => sum + event.grade_weight, 0);

  async function upload(file) {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    setNotice("Reading syllabus and extracting dates…");
    try {
      await request("/upload", { method: "POST", body });
      await refresh();
      setNotice("Syllabus added successfully.");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function setStatus(event, status) {
    await request(`/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refresh();
  }

  async function createTask(payload) {
    await request("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await refresh();
  }

  async function deleteCourse(course) {
    if (!window.confirm(`Delete ${course.code} and all of its tasks? This cannot be undone.`)) return;
    try {
      await request(`/courses/${course.id}`, { method: "DELETE" });
      await refresh();
      setNotice(`${course.code} was deleted.`);
    } catch (error) {
      setNotice(error.message);
    }
  }

  let page;
  if (view === "board") {
    page = (
      <TaskBoard
        events={events}
        courses={courses}
        courseMap={courseMap}
        setStatus={setStatus}
        createTask={createTask}
      />
    );
  } else if (view === "calendar") {
    page = <AcademicCalendar events={events} courseMap={courseMap}/>;
  } else if (view === "grades") {
    page = <GradeCalculator courses={courses} events={events}/>;
  } else {
    page = (
      <Dashboard
        courses={courses}
        events={events}
        courseMap={courseMap}
        setView={setView}
        openChat={() => setChatOpen(true)}
        setStatus={setStatus}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        courses={courses}
        courseMap={courseMap}
        currentView={view}
        setView={setView}
        upload={upload}
        deleteCourse={deleteCourse}
        apiUrl={API}
      />
      <main className="main-content">
        <Masthead
          view={view}
          courses={courses}
          events={events}
          notice={notice}
          completedWeight={completedWeight}
          openChat={() => setChatOpen(true)}
        />
        {page}
      </main>
      {chatOpen && (
        <ChatDrawer
          close={() => setChatOpen(false)}
          courses={courses}
          selectedCourse={selectedCourse}
          setSelectedCourse={setSelectedCourse}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App/>);
