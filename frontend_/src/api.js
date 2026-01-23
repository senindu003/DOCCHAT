// src/api.js

// Base URL from Vite env
const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
console.log(VITE_API_BASE_URL);

// Helper to add auth header when token exists
function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function authHeaders_set_info() {
  const token = localStorage.getItem("token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ---------- AUTH ---------- */

export async function signupUser(payload) {
  const res = await fetch(`${VITE_API_BASE_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Signup failed");
  }
  return res.json();
}

export async function loginUser(payload) {
  const res = await fetch(`${VITE_API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Login failed");
  }
  return res.json();
}

export async function userDetails() {
  const res = await fetch(`${VITE_API_BASE_URL}/users/me`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Unauthorized user!");
  }
  return res.json();
}

/*export async function sendFiles(payload) {
  const res = await fetch(`${VITE_API_BASE_URL}/set_info`, {
    method: "POST",
    headers: authHeaders_set_info(),
    body: payload,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "info Not Set!");
  }
  return res.json();
}*/

/*export async function sendQuery(payload) {
  const res = await fetch(`${VITE_API_BASE_URL}/get_info`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ query: payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Query can't be processed!");
  }
  return res.json();
}*/
