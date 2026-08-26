// src/api.js

// Base URL from Vite env
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function errorMessage(detail, fallback) {
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(" ");
  }
  return detail || fallback;
}

// Helper to add auth header when token exists
function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/* ---------- AUTH ---------- */

export async function signupUser(payload) {
  const res = await fetch(`${API_BASE_URL}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(errorMessage(err.detail, "Signup failed"));
  }
  return res.json();
}

export async function loginUser(payload) {
  const res = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(errorMessage(err.detail, "Login failed"));
  }
  return res.json();
}

export async function userDetails() {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(errorMessage(err.detail, "Unauthorized user!"));
  }
  return res.json();
}

export function createUploadJob(formData, onUploadProgress) {
  const token = localStorage.getItem("token");
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/set_info`);
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onUploadProgress(Math.round((event.loaded / event.total) * 8));
    };
    request.onerror = () => reject(new Error("Network error while uploading PDFs"));
    request.onload = () => {
      let payload = {};
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        reject(new Error("The server returned an invalid upload response"));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(errorMessage(payload.detail, `Upload failed with status ${request.status}`)));
        return;
      }
      resolve(payload);
    };
    request.send(formData);
  });
}

export async function getUploadJob(jobId) {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_BASE_URL}/uploads/${jobId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(payload.detail, "Could not retrieve upload progress"));
  return payload;
}

export async function listDocuments() {
  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "GET",
    headers: authHeaders(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(payload.detail, "Could not load documents"));
  return payload;
}

export async function removeDocument(documentInfo) {
  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify(documentInfo),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(payload.detail, "Could not remove document"));
  return payload;
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
