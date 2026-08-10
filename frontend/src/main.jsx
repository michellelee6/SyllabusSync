import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { request, setToken, getToken } from "./lib/api";
import { courseColors } from "./lib/format";
import { AuthScreen } from "./components/AuthScreen";
import { Sidebar } from "./components/Sidebar";
import { Masthead } from "./components/Masthead";
import { Dashboard } from "./components/Dashboard";
import { TaskBoard } from "./components/TaskBoard";
import { AcademicCalendar } from "./components/AcademicCalendar";
import { GradeCalculator } from "./components/GradeCalculator";
import { ChatDrawer } from "./components/ChatDrawer";
import "./styles.css";

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState("overview");
  const [courses, setCourses] = useState([]);
  const [events, setEvents] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [notice, setNotice] = useState("");

  const handleAuthenticated = useCallback(result => {
    setToken(result.access_token);
    setUser(result.user);
    setNotice("");
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setCourses([]);
    setEvents([]);
    setSelectedCourse("");
    setChatOpen(false);
    setNotice("");
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthReady(true);
      return;
    }
    request("/auth/me")
      .then(current => setUser(current))
      .catch(() => setToken(null))
      .finally(() => setAuthReady(true));
  }, []);

  const refresh = async () => {
    try {
      const [courseList, eventList] = await Promise.all([request("/courses"), request("/events")]);
      setCourses(courseList);
      setEvents(eventList);
      setSelectedCourse(current => {
        if (current && courseList.some(course => String(course.id) === String(current))) return current;
        return String(courseList[0]?.id || "");
      });
    } catch (error) {
      if (String(error.message).toLowerCase().includes("sign in")) {
        signOut();
        return;
      }
      setNotice("Start the FastAPI server to load your courses.");
    }
  };

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user]);

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

  async function updateTask(eventId, payload) {
    await request(`/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await refresh();
  }

  async function deleteTask(eventId) {
    await request(`/events/${eventId}`, { method: "DELETE" });
    await refresh();
  }

  async function deleteCourse(course) {
    try {
      await request(`/courses/${course.id}`, { method: "DELETE" });
      await refresh();
      setNotice(`${course.code} was deleted.`);
    } catch (error) {
      setNotice(error.message);
    }
  }

  if (!authReady) {
    return <div className="auth-shell"><div className="auth-panel auth-loading">Loading…</div></div>;
  }

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
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
        updateTask={updateTask}
        deleteTask={deleteTask}
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
        user={user}
        signOut={signOut}
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
