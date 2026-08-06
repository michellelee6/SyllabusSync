import { useState } from "react";
import { Send, X } from "lucide-react";
import { request } from "../lib/api";

export function ChatDrawer({ close, courses, selectedCourse, setSelectedCourse }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  async function ask(event) {
    event.preventDefault();
    if (!question.trim() || !selectedCourse) return;
    const prompt = question;
    setMessages(items => [...items, { role: "you", text: prompt }]);
    setQuestion("");
    try { const result = await request("/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course_id: Number(selectedCourse), prompt }) }); setMessages(items => [...items, { role: "sync", text: result.answer }]); }
    catch (error) { setMessages(items => [...items, { role: "sync", text: error.message }]); }
  }
  return <aside className="chat-drawer"><header><div><p className="eyebrow">Document-grounded help</p><h2>Syllabus Q&A</h2></div><button aria-label="Close chat" onClick={close}><X size={20}/></button></header><div className="chat-course"><select value={selectedCourse} onChange={event => setSelectedCourse(event.target.value)}>{courses.length ? courses.map(course => <option key={course.id} value={course.id}>{course.code} — {course.title}</option>) : <option>No uploaded courses</option>}</select></div><div className="messages">{messages.length ? messages.map((message, index) => <div key={index} className={`message ${message.role}`}>{message.text}</div>) : <p>Ask about office hours, grading, attendance, or course policies.</p>}</div><form onSubmit={ask}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask a question…"/><button aria-label="Send question"><Send size={18}/></button></form></aside>;
}
