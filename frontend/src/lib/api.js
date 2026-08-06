export const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export async function request(path, options) {
  const response = await fetch(`${API}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Something went wrong");
  }
  return response.status === 204 ? null : response.json();
}
